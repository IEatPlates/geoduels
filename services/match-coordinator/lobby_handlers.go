package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"geoduels/pkg/contracts"
	"geoduels/pkg/coordinator"
	"geoduels/pkg/matchlaunch"
	"geoduels/pkg/observability"
	"geoduels/pkg/sessionpolicy"
)

var lobbyUpgrader = websocket.Upgrader{CheckOrigin: wsOriginAllowed}

const lobbyPresenceTTL = 90 * time.Second

func (q *matchCoordinator) lobbyWS(w http.ResponseWriter, r *http.Request) {
	claims, err := q.authenticatedClaims(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	lobbyID := strings.TrimSpace(mux.Vars(r)["id"])
	snap, ok, err := q.persist.GetLobbyByID(lobbyID)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusBadGateway)
		return
	}
	if !ok || !lobbyHasMember(snap, claims.Sub) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	conn, err := lobbyUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	connID := strconvTimeID()
	defer q.clearLobbyPresence(lobbyID, claims.Sub, connID)
	conn.SetReadLimit(1024)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		q.touchLobbyPresence(lobbyID, claims.Sub, connID)
		return conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	})
	go func() {
		defer cancel()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	var writeMu sync.Mutex
	q.touchLobbyPresence(lobbyID, claims.Sub, connID)
	q.writeLobbySnapshot(conn, &writeMu, snap)

	pollTicker := time.NewTicker(750 * time.Millisecond)
	defer pollTicker.Stop()
	presenceTicker := time.NewTicker(10 * time.Second)
	defer presenceTicker.Stop()
	pingTicker := time.NewTicker(20 * time.Second)
	defer pingTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-pollTicker.C:
			next, ok, err := q.persist.GetLobbyByID(lobbyID)
			if err != nil || !ok {
				q.writeQueueMessage(conn, &writeMu, "lobby_error", map[string]string{"message": "Lobby unavailable"})
				return
			}
			if !lobbyHasMember(next, claims.Sub) {
				q.writeQueueMessage(conn, &writeMu, "lobby_error", map[string]string{"message": "You left this lobby"})
				return
			}
			q.writeLobbySnapshot(conn, &writeMu, next)
			activeMatchID := next.ActiveMatchID
			if activeMatchID == "" {
				activeMatchID = next.StartedMatchID
			}
			if (next.State == contracts.LobbyInMatch || next.State == contracts.LobbyStarted) && activeMatchID != "" {
				if assigned, ok, err := q.state.GetAssignmentByMatch(ctx, activeMatchID); err == nil && ok {
					if payload, ok, err := q.launcher().AssignedPayload(claims.Sub, assigned); err == nil && ok {
						q.writeQueueMessage(conn, &writeMu, "match_assigned", payload)
						return
					}
				}
			}
			if next.State != contracts.LobbyOpen {
				return
			}
		case <-presenceTicker.C:
			q.touchLobbyPresence(lobbyID, claims.Sub, connID)
		case <-pingTicker.C:
			if !q.writeQueuePing(conn, &writeMu) {
				return
			}
		}
	}
}

func (q *matchCoordinator) startLobby(w http.ResponseWriter, r *http.Request) {
	claims, err := q.authenticatedClaims(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	lobbyID := strings.TrimSpace(mux.Vars(r)["id"])
	snap, ok, err := q.persist.GetLobbyByID(lobbyID)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusBadGateway)
		return
	}
	if !ok {
		http.Error(w, "lobby not found", http.StatusNotFound)
		return
	}
	if snap.OwnerUserID != claims.Sub {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if q.redis != nil {
		q.applyLobbyPresence(&snap)
		if err := requireLobbyPresence(snap); err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
	}
	found, err := q.lobbyMatchFound(snap)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	for _, userID := range found.Players {
		if assigned, ok, err := q.state.GetAssignmentByUser(r.Context(), userID); err == nil && ok {
			mode := sessionpolicy.NormalizeMode(assigned.Mode, assigned.MatchID)
			switch q.launcher().ValidateAssignment(r.Context(), assigned) {
			case matchlaunch.AssignmentValid, matchlaunch.AssignmentPending:
				if mode == contracts.ModeDuel {
					http.Error(w, activeLobbyMatchConflict(userID, assigned, found.Profiles[userID]), http.StatusConflict)
					return
				}
				q.clearSupersededAssignment(context.Background(), assigned)
			case matchlaunch.AssignmentAbandoned, matchlaunch.AssignmentInvalid:
				_ = q.state.ClearAssignment(context.Background(), assigned)
			}
		}
	}
	assigned, err := q.launcher().EnsureAssignment(r.Context(), found)
	if err != nil {
		http.Error(w, "lobby start failed", http.StatusBadGateway)
		return
	}
	snap, err = q.persist.MarkLobbyInMatch(lobbyID, found.MatchID)
	if err != nil {
		http.Error(w, "lobby start failed", http.StatusConflict)
		return
	}
	payload, ok, err := q.launcher().AssignedPayload(claims.Sub, assigned)
	if err != nil || !ok {
		http.Error(w, "unable to issue gameplay ticket", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(contracts.LobbyStartResponse{Assignment: payload})
}

func (q *matchCoordinator) clearSupersededAssignment(ctx context.Context, assigned coordinator.Assignment) {
	if sessionpolicy.NormalizeMode(assigned.Mode, assigned.MatchID) == contracts.ModeSingleplayer {
		q.terminateSupersededMatch(ctx, assigned)
	}
	_ = q.state.ClearAssignment(ctx, assigned)
	if q.persist != nil && sessionpolicy.NormalizeMode(assigned.Mode, assigned.MatchID) == contracts.ModeSingleplayer {
		_ = q.persist.RecordRuntimeMatch(assigned.MatchID, string(contracts.MatchEnded), assigned.NodeEpoch, true)
	}
}

func (q *matchCoordinator) terminateSupersededMatch(ctx context.Context, assigned coordinator.Assignment) {
	node, ok, err := q.state.GetNodeByRoute(ctx, assigned.PublicRoute)
	if err != nil || !ok || strings.TrimSpace(node.InternalURL) == "" {
		return
	}
	userID := ""
	if len(assigned.Players) > 0 {
		userID = assigned.Players[0]
	}
	body, _ := json.Marshal(map[string]string{"userId": userID})
	reqCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(
		reqCtx,
		http.MethodPost,
		strings.TrimRight(node.InternalURL, "/")+"/internal/matches/"+url.PathEscape(assigned.MatchID)+"/terminate",
		bytes.NewReader(body),
	)
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Coordinator-Secret", q.internal)
	client := q.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		observability.Log("warn", "superseded lobby match terminate failed", map[string]any{"matchId": assigned.MatchID, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		observability.Log("warn", "superseded lobby match terminate rejected", map[string]any{"matchId": assigned.MatchID, "status": resp.StatusCode})
	}
}

func activeLobbyMatchConflict(userID string, assigned coordinator.Assignment, profile contracts.PlayerProfile) string {
	name := strings.TrimSpace(profile.DisplayName)
	if name == "" {
		name = userID
	}
	mode := sessionpolicy.NormalizeMode(assigned.Mode, assigned.MatchID)
	return "player " + name + " (" + userID + ") already has an active " + string(mode) + " match " + assigned.MatchID
}

func (q *matchCoordinator) lobbyMatchFound(snap contracts.LobbySnapshot) (contracts.MatchFound, error) {
	if snap.State != contracts.LobbyOpen {
		return contracts.MatchFound{}, errors.New("lobby is not open")
	}
	active := make([]contracts.LobbyMember, 0, len(snap.Members))
	for _, member := range snap.Members {
		if strings.TrimSpace(member.UserID) != "" {
			active = append(active, member)
		}
	}
	if len(active) != 2 {
		return contracts.MatchFound{}, errors.New("duel lobby requires exactly two players")
	}
	match := contracts.MatchFound{
		MatchID:               "m-" + strconvTimeID(),
		Mode:                  contracts.ModeDuel,
		Unranked:              true,
		Players:               []string{active[0].UserID, active[1].UserID},
		Profiles:              map[string]contracts.PlayerProfile{},
		MapScope:              defaultLobbyMapScope(snap.MapScope),
		SourceLobbyID:         snap.ID,
		SourceLobbyInviteCode: snap.InviteCode,
	}
	for _, member := range active {
		match.Profiles[member.UserID] = contracts.PlayerProfile{
			UserID:      member.UserID,
			DisplayName: member.DisplayName,
			AvatarURL:   member.AvatarURL,
			IsGuest:     member.IsGuest,
			IsAdmin:     member.IsAdmin,
		}
		if profile, err := q.persist.GetProfile(member.UserID); err == nil {
			player := match.Profiles[member.UserID]
			player.MMR = profile.MMR
			player.RatingRD = profile.RatingRD
			player.RankedGamesPlayed = profile.RankedGamesPlayed
			match.Profiles[member.UserID] = player
		}
	}
	return match, nil
}

func (q *matchCoordinator) writeLobbySnapshot(conn *websocket.Conn, writeMu *sync.Mutex, snap contracts.LobbySnapshot) bool {
	q.applyLobbyPresence(&snap)
	return q.writeQueueMessage(conn, writeMu, "lobby_snapshot", snap)
}

func (q *matchCoordinator) touchLobbyPresence(lobbyID, userID, connID string) {
	if q.redis == nil || strings.TrimSpace(lobbyID) == "" || strings.TrimSpace(userID) == "" {
		return
	}
	key := "lobby:presence:" + lobbyID
	now := time.Now().UnixMilli()
	field := lobbyPresenceField(userID, connID)
	_, err := q.redis.TxPipelined(context.Background(), func(pipe redis.Pipeliner) error {
		pipe.HSet(context.Background(), key, field, now)
		pipe.Expire(context.Background(), key, lobbyPresenceTTL)
		return nil
	})
	if err != nil {
		observability.Log("warn", "lobby presence touch failed", map[string]any{"lobbyId": lobbyID, "userId": userID, "error": err.Error()})
	}
}

func (q *matchCoordinator) clearLobbyPresence(lobbyID, userID, connID string) {
	if q.redis == nil || strings.TrimSpace(lobbyID) == "" || strings.TrimSpace(userID) == "" {
		return
	}
	if err := q.redis.HDel(context.Background(), "lobby:presence:"+lobbyID, lobbyPresenceField(userID, connID)).Err(); err != nil {
		observability.Log("warn", "lobby presence clear failed", map[string]any{"lobbyId": lobbyID, "userId": userID, "error": err.Error()})
	}
}

func (q *matchCoordinator) applyLobbyPresence(snap *contracts.LobbySnapshot) {
	if snap == nil || q.redis == nil {
		return
	}
	values, err := q.redis.HGetAll(context.Background(), "lobby:presence:"+snap.ID).Result()
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-lobbyPresenceTTL).UnixMilli()
	connected := map[string]bool{}
	for field, raw := range values {
		if ms, err := strconv.ParseInt(raw, 10, 64); err == nil && ms >= cutoff {
			connected[lobbyPresenceUserID(field)] = true
		}
	}
	for i := range snap.Members {
		snap.Members[i].Connected = connected[snap.Members[i].UserID]
	}
}

func requireLobbyPresence(snap contracts.LobbySnapshot) error {
	missing := make([]string, 0, len(snap.Members))
	for _, member := range snap.Members {
		if strings.TrimSpace(member.UserID) == "" {
			continue
		}
		if !member.Connected {
			name := strings.TrimSpace(member.DisplayName)
			if name == "" {
				name = member.UserID
			}
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return errors.New("all players must be in the lobby to start: " + strings.Join(missing, ", "))
	}
	return nil
}

func lobbyPresenceField(userID, connID string) string {
	connID = strings.TrimSpace(connID)
	if connID == "" {
		return userID
	}
	return userID + "|" + connID
}

func lobbyPresenceUserID(field string) string {
	if before, _, ok := strings.Cut(field, "|"); ok {
		return before
	}
	return ""
}

func (q *matchCoordinator) runLobbyCleanupLoop(interval, inactivityTTL time.Duration) {
	if interval <= 0 || inactivityTTL <= 0 {
		return
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		q.cleanupOpenLobbies(inactivityTTL)
		<-ticker.C
	}
}

func (q *matchCoordinator) cleanupOpenLobbies(inactivityTTL time.Duration) {
	if reopened, err := q.persist.ReopenEndedLobbies(); err != nil {
		observability.Log("warn", "ended lobby reopen failed", map[string]any{"error": err.Error()})
	} else if reopened > 0 {
		observability.Log("info", "ended lobbies reopened", map[string]any{"members": reopened})
	}
	if err := q.persist.ExpireOpenLobbies(); err != nil {
		observability.Log("warn", "lobby expiry cleanup failed", map[string]any{"error": err.Error()})
		return
	}
	ids, err := q.persist.ListOpenLobbyIDs()
	if err != nil {
		observability.Log("warn", "open lobby cleanup list failed", map[string]any{"error": err.Error()})
		return
	}
	inactive := make([]string, 0, len(ids))
	cutoff := time.Now().Add(-lobbyPresenceTTL).UnixMilli()
	for _, lobbyID := range ids {
		active, err := q.lobbyHasActivePresence(lobbyID, cutoff)
		if err != nil {
			observability.Log("warn", "lobby presence cleanup check failed", map[string]any{"lobbyId": lobbyID, "error": err.Error()})
			continue
		}
		if !active {
			inactive = append(inactive, lobbyID)
		}
	}
	closed, err := q.persist.CloseInactiveOpenLobbies(inactive, inactivityTTL)
	if err != nil {
		observability.Log("warn", "inactive lobby cleanup failed", map[string]any{"error": err.Error()})
		return
	}
	if closed > 0 {
		observability.Log("info", "inactive lobbies closed", map[string]any{"count": closed})
	}
}

func (q *matchCoordinator) lobbyHasActivePresence(lobbyID string, cutoffUnixMS int64) (bool, error) {
	if q.redis == nil {
		return false, nil
	}
	values, err := q.redis.HGetAll(context.Background(), "lobby:presence:"+lobbyID).Result()
	if err != nil {
		return false, err
	}
	for _, raw := range values {
		ms, err := strconv.ParseInt(raw, 10, 64)
		if err == nil && ms >= cutoffUnixMS {
			return true, nil
		}
	}
	return false, nil
}

func lobbyHasMember(snap contracts.LobbySnapshot, userID string) bool {
	for _, member := range snap.Members {
		if member.UserID == userID {
			return true
		}
	}
	return false
}

func strconvTimeID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func defaultLobbyMapScope(v string) string {
	if strings.TrimSpace(v) == "" {
		return "world"
	}
	return v
}
