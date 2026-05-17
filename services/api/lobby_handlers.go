package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"geoduels/pkg/contracts"
	"geoduels/pkg/lobbyevents"
)

const defaultLobbyTTL = 2 * time.Hour

func (a *api) createLobby(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	var req contracts.LobbyCreateRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = contracts.ModeDuel
	}
	if !contracts.IsPrivatePartyMode(mode) {
		http.Error(w, "unsupported lobby mode", http.StatusBadRequest)
		return
	}
	snap, err := a.store.CreateLobby(userID, mode, req.MapScope, defaultLobbyTTL)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusInternalServerError)
		return
	}
	if req.Config.Ruleset != "" || req.Config.RoundTimerMode != "" || req.Config.RoundTimeLimitMS > 0 || req.Config.PressureTimeLimitMS > 0 {
		cfg, err := a.lobbySettings.Save(r.Context(), snap.ID, req.Config)
		if err != nil {
			http.Error(w, "lobby unavailable", http.StatusInternalServerError)
			return
		}
		snap.Config = cfg
	} else {
		snap = a.lobbySettings.Apply(r.Context(), snap)
	}
	writeJSON(w, snap)
}

func (a *api) getLobby(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimSpace(mux.Vars(r)["code"])
	snap, ok, err := a.store.GetLobbyByInviteCode(code)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "lobby not found", http.StatusNotFound)
		return
	}
	writeJSON(w, a.lobbySettings.Apply(r.Context(), snap))
}

func (a *api) joinLobby(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	code := strings.TrimSpace(mux.Vars(r)["code"])
	snap, found, err := a.store.GetLobbyByInviteCode(code)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "lobby not found", http.StatusNotFound)
		return
	}
	snap, err = a.store.JoinLobby(snap.ID, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	a.publishLobbyChanged(r, snap.ID)
	writeJSON(w, a.lobbySettings.Apply(r.Context(), snap))
}

func (a *api) leaveLobby(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(mux.Vars(r)["id"])
	snap, err := a.store.LeaveLobby(id, userID)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusBadRequest)
		return
	}
	a.publishLobbyChanged(r, snap.ID)
	writeJSON(w, a.lobbySettings.Apply(r.Context(), snap))
}

func (a *api) kickLobbyMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	var req contracts.LobbyMemberRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(mux.Vars(r)["id"])
	snap, err := a.store.KickLobbyMember(id, userID, strings.TrimSpace(req.UserID))
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusBadRequest)
		return
	}
	a.publishLobbyChanged(r, snap.ID)
	writeJSON(w, a.lobbySettings.Apply(r.Context(), snap))
}

func (a *api) transferLobbyOwner(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	var req contracts.LobbyMemberRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(mux.Vars(r)["id"])
	snap, err := a.store.TransferLobbyOwner(id, userID, strings.TrimSpace(req.UserID))
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusBadRequest)
		return
	}
	a.publishLobbyChanged(r, snap.ID)
	writeJSON(w, a.lobbySettings.Apply(r.Context(), snap))
}

func (a *api) updateLobbyTeam(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	var req contracts.LobbyTeamRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(mux.Vars(r)["id"])
	snap, err := a.store.SetLobbyMemberTeam(id, userID, strings.TrimSpace(req.TeamID))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.publishLobbyChanged(r, snap.ID)
	writeJSON(w, a.lobbySettings.Apply(r.Context(), snap))
}

func (a *api) updateLobbySettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.requirePlayableUser(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(mux.Vars(r)["id"])
	snap, found, err := a.store.GetLobbyByID(id)
	if err != nil {
		http.Error(w, "lobby unavailable", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "lobby not found", http.StatusNotFound)
		return
	}
	if snap.OwnerUserID != userID {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if snap.State != contracts.LobbyOpen {
		http.Error(w, "lobby settings are locked", http.StatusConflict)
		return
	}
	var req struct {
		Mode   contracts.MatchMode   `json:"mode"`
		Config contracts.MatchConfig `json:"config"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Mode != "" && !contracts.IsPrivatePartyMode(req.Mode) {
		http.Error(w, "unsupported lobby mode", http.StatusBadRequest)
		return
	}
	if req.Mode != "" && req.Mode != snap.Mode {
		if err := a.store.SetLobbyMode(snap.ID, req.Mode); err != nil {
			http.Error(w, "lobby settings unavailable", http.StatusBadGateway)
			return
		}
		snap.Mode = req.Mode
	}
	cfg, err := a.lobbySettings.Save(r.Context(), snap.ID, req.Config)
	if err != nil {
		http.Error(w, "lobby settings unavailable", http.StatusBadGateway)
		return
	}
	snap.Config = cfg
	a.publishLobbyChanged(r, snap.ID)
	writeJSON(w, snap)
}

func (a *api) publishLobbyChanged(r *http.Request, lobbyID string) {
	if a.redis == nil || strings.TrimSpace(lobbyID) == "" {
		return
	}
	_ = a.redis.Publish(r.Context(), lobbyevents.Channel(lobbyID), lobbyevents.KindChanged).Err()
}

func (a *api) requirePlayableUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	appClaims, err := a.authenticatedClaims(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return "", false
	}
	identity, err := a.store.GetIdentity(appClaims.Sub)
	if err != nil {
		http.Error(w, "identity not found", http.StatusUnauthorized)
		return "", false
	}
	if identity.IsBanned {
		http.Error(w, "account is banned", http.StatusForbidden)
		return "", false
	}
	if !identity.Onboarded {
		http.Error(w, "onboarding incomplete", http.StatusForbidden)
		return "", false
	}
	if identity.AuthMigrationRequired {
		http.Error(w, "connect discord to continue", http.StatusForbidden)
		return "", false
	}
	return appClaims.Sub, true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
