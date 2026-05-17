package persistence

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"geoduels/pkg/contracts"
)

func (s *pgStore) CreateLobby(ownerUserID string, mode contracts.MatchMode, mapScope string, ttl time.Duration) (contracts.LobbySnapshot, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	if ownerUserID == "" {
		return contracts.LobbySnapshot{}, errors.New("owner required")
	}
	if mode == "" {
		mode = contracts.ModeDuel
	}
	if !contracts.IsPrivatePartyMode(mode) {
		return contracts.LobbySnapshot{}, errors.New("unsupported lobby mode")
	}
	if strings.TrimSpace(mapScope) == "" {
		mapScope = "world"
	}
	if ttl <= 0 {
		ttl = 2 * time.Hour
	}
	expiresAt := time.Now().Add(ttl)
	for attempt := 0; attempt < 5; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			cancel()
			return contracts.LobbySnapshot{}, err
		}
		inviteCode := newLobbyCode()
		lobbyID := newLobbyID("lob")
		_, err = tx.Exec(ctx, `
			insert into lobbies(id, invite_code, owner_user_id, state, mode, map_scope, expires_at)
			values($1, $2, $3, 'open', $4, $5, $6)
		`, lobbyID, inviteCode, ownerUserID, string(mode), mapScope, expiresAt)
		if err != nil {
			_ = tx.Rollback(ctx)
			cancel()
			if attempt == 4 {
				return contracts.LobbySnapshot{}, err
			}
			continue
		}
		if _, err := tx.Exec(ctx, `
		insert into lobby_members(lobby_id, user_id, role, ready, team_id)
		values($1, $2, 'owner', false, 'a')
		`, lobbyID, ownerUserID); err != nil {
			_ = tx.Rollback(ctx)
			cancel()
			return contracts.LobbySnapshot{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			cancel()
			return contracts.LobbySnapshot{}, err
		}
		cancel()
		snap, _, err := s.GetLobbyByID(lobbyID)
		return snap, err
	}
	return contracts.LobbySnapshot{}, errors.New("could not allocate lobby invite code")
}

func (s *pgStore) GetLobbyByID(lobbyID string) (contracts.LobbySnapshot, bool, error) {
	return s.getLobby("l.id = $1", strings.TrimSpace(lobbyID))
}

func (s *pgStore) SetLobbyMode(lobbyID string, mode contracts.MatchMode) error {
	lobbyID = strings.TrimSpace(lobbyID)
	if lobbyID == "" || !contracts.IsPrivatePartyMode(mode) {
		return errors.New("invalid lobby mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update lobbies
		set mode = $2, updated_at = now()
		where id = $1 and state = 'open'
	`, lobbyID, string(mode))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("lobby is not open")
	}
	return nil
}

func (s *pgStore) GetLobbyByInviteCode(inviteCode string) (contracts.LobbySnapshot, bool, error) {
	return s.getLobby("l.invite_code = $1", strings.ToUpper(strings.TrimSpace(inviteCode)))
}

func (s *pgStore) GetLobbyByMatchID(matchID string) (contracts.LobbySnapshot, bool, error) {
	matchID = strings.TrimSpace(matchID)
	if matchID == "" {
		return contracts.LobbySnapshot{}, false, nil
	}
	return s.getLobby("(l.active_match_id = $1 or l.last_match_id = $1 or l.started_match_id = $1)", matchID)
}

func (s *pgStore) JoinLobby(lobbyID, userID string) (contracts.LobbySnapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if err := s.ensureLobbyOpen(ctx, lobbyID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	var activeMembers int
	if err := s.pool.QueryRow(ctx, `
		select count(*) from lobby_members
		where lobby_id = $1 and left_at is null and user_id <> $2
	`, lobbyID, userID).Scan(&activeMembers); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if activeMembers >= 8 {
		return contracts.LobbySnapshot{}, errors.New("lobby is full")
	}
	role := "member"
	if snap, ok, err := s.GetLobbyByID(lobbyID); err != nil {
		return contracts.LobbySnapshot{}, err
	} else if !ok {
		return contracts.LobbySnapshot{}, pgx.ErrNoRows
	} else if snap.OwnerUserID == userID {
		role = "owner"
	}
	_, err := s.pool.Exec(ctx, `
		insert into lobby_members(lobby_id, user_id, role, ready, team_id, left_at)
		values($1, $2, $3, false, (
			select case
				when count(*) filter (where team_id = 'a') <= count(*) filter (where team_id = 'b') then 'a'
				else 'b'
			end
			from lobby_members
			where lobby_id = $1 and left_at is null
		), null)
		on conflict (lobby_id, user_id) do update set
			role = case when lobby_members.role = 'owner' then 'owner' else excluded.role end,
			team_id = coalesce(lobby_members.team_id, excluded.team_id),
			left_at = null,
			joined_at = case when lobby_members.left_at is null then lobby_members.joined_at else now() end
	`, lobbyID, userID, role)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if _, err := s.pool.Exec(ctx, `
		update lobbies set updated_at = now()
		where id = $1 and state = 'open'
	`, lobbyID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	snap, _, err := s.GetLobbyByID(lobbyID)
	return snap, err
}

func (s *pgStore) LeaveLobby(lobbyID, userID string) (contracts.LobbySnapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	defer tx.Rollback(ctx)

	var ownerUserID string
	var state string
	if err := tx.QueryRow(ctx, `
		select owner_user_id, state from lobbies where id = $1
	`, lobbyID).Scan(&ownerUserID, &state); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if state != string(contracts.LobbyOpen) {
		return contracts.LobbySnapshot{}, errors.New("lobby is not open")
	}
	tag, err := tx.Exec(ctx, `
		update lobby_members set left_at = now(), ready = false
		where lobby_id = $1 and user_id = $2 and left_at is null
	`, lobbyID, userID)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if tag.RowsAffected() == 0 {
		return contracts.LobbySnapshot{}, pgx.ErrNoRows
	}
	if ownerUserID == userID {
		var nextOwner string
		err = tx.QueryRow(ctx, `
			select user_id
			from lobby_members
			where lobby_id = $1 and left_at is null
			order by joined_at asc
			limit 1
		`, lobbyID).Scan(&nextOwner)
		if errors.Is(err, pgx.ErrNoRows) {
			if _, err := tx.Exec(ctx, `
				update lobbies set state = 'closed', updated_at = now()
				where id = $1 and state = 'open'
			`, lobbyID); err != nil {
				return contracts.LobbySnapshot{}, err
			}
		} else if err != nil {
			return contracts.LobbySnapshot{}, err
		} else {
			if err := transferLobbyOwnerTx(ctx, tx, lobbyID, userID, nextOwner); err != nil {
				return contracts.LobbySnapshot{}, err
			}
		}
	}
	if _, err := tx.Exec(ctx, `
		update lobbies set updated_at = now()
		where id = $1 and state = 'open'
	`, lobbyID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	next, _, err := s.GetLobbyByID(lobbyID)
	return next, err
}

func (s *pgStore) SetLobbyMemberTeam(lobbyID, userID, teamID string) (contracts.LobbySnapshot, error) {
	lobbyID = strings.TrimSpace(lobbyID)
	userID = strings.TrimSpace(userID)
	teamID = strings.ToLower(strings.TrimSpace(teamID))
	if lobbyID == "" || userID == "" || (teamID != "a" && teamID != "b") {
		return contracts.LobbySnapshot{}, errors.New("invalid lobby team")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if err := s.ensureLobbyOpen(ctx, lobbyID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update lobby_members
		set team_id = $3
		where lobby_id = $1 and user_id = $2 and left_at is null
	`, lobbyID, userID, teamID)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if tag.RowsAffected() == 0 {
		return contracts.LobbySnapshot{}, pgx.ErrNoRows
	}
	if _, err := s.pool.Exec(ctx, `
		update lobbies set updated_at = now()
		where id = $1 and state = 'open'
	`, lobbyID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	snap, _, err := s.GetLobbyByID(lobbyID)
	return snap, err
}

func (s *pgStore) ExpireOpenLobbies() error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update lobbies
		set state = 'expired',
			updated_at = now()
		where state = 'open'
		  and expires_at < now()
	`)
	return err
}

func (s *pgStore) ListOpenLobbyIDs() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	rows, err := s.pool.Query(ctx, `
		select id
		from lobbies
		where state = 'open'
		order by updated_at asc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *pgStore) CloseInactiveOpenLobbies(lobbyIDs []string, inactiveFor time.Duration) (int64, error) {
	if len(lobbyIDs) == 0 || inactiveFor <= 0 {
		return 0, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update lobbies
		set state = 'closed',
			updated_at = now()
		where state = 'open'
		  and id = any($1)
		  and updated_at < now() - ($2::double precision * interval '1 second')
	`, lobbyIDs, inactiveFor.Seconds())
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *pgStore) KickLobbyMember(lobbyID, ownerUserID, targetUserID string) (contracts.LobbySnapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	ownerUserID = strings.TrimSpace(ownerUserID)
	targetUserID = strings.TrimSpace(targetUserID)
	if ownerUserID == "" || targetUserID == "" || ownerUserID == targetUserID {
		return contracts.LobbySnapshot{}, errors.New("invalid lobby member")
	}
	if err := s.ensureLobbyOwner(ctx, lobbyID, ownerUserID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update lobby_members set left_at = now(), ready = false
		where lobby_id = $1 and user_id = $2 and role <> 'owner' and left_at is null
	`, lobbyID, targetUserID)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if tag.RowsAffected() == 0 {
		return contracts.LobbySnapshot{}, pgx.ErrNoRows
	}
	snap, _, err := s.GetLobbyByID(lobbyID)
	return snap, err
}

func (s *pgStore) TransferLobbyOwner(lobbyID, ownerUserID, targetUserID string) (contracts.LobbySnapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	defer tx.Rollback(ctx)
	if err := ensureLobbyOwnerTx(ctx, tx, lobbyID, ownerUserID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if err := transferLobbyOwnerTx(ctx, tx, lobbyID, ownerUserID, targetUserID); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return contracts.LobbySnapshot{}, err
	}
	snap, _, err := s.GetLobbyByID(lobbyID)
	return snap, err
}

func (s *pgStore) MarkLobbyInMatch(lobbyID, matchID string) (contracts.LobbySnapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update lobbies
		set state = 'in_match',
			active_match_id = $2,
			started_match_id = $2,
			updated_at = now()
		where id = $1 and state = 'open'
	`, lobbyID, matchID)
	if err != nil {
		return contracts.LobbySnapshot{}, err
	}
	if tag.RowsAffected() == 0 {
		return contracts.LobbySnapshot{}, pgx.ErrNoRows
	}
	snap, _, err := s.GetLobbyByID(lobbyID)
	return snap, err
}

func (s *pgStore) ReopenEndedLobbies() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		with ended as (
			select l.id, l.active_match_id
			from lobbies l
			join runtime_matches rm on rm.id = l.active_match_id
			where l.state in ('in_match', 'started')
			  and rm.state = $1
		),
		reopened as (
			update lobbies l
			set state = 'open',
				last_match_id = ended.active_match_id,
				active_match_id = null,
				started_match_id = null,
				updated_at = now()
			from ended
			where l.id = ended.id
			returning l.id
		)
		update lobby_members m
		set ready = false
		from reopened
		where m.lobby_id = reopened.id
	`, string(contracts.MatchEnded))
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *pgStore) ensureLobbyOpen(ctx context.Context, lobbyID string) error {
	var state string
	var expiresAt time.Time
	err := s.pool.QueryRow(ctx, `select state, expires_at from lobbies where id = $1`, lobbyID).Scan(&state, &expiresAt)
	if err != nil {
		return err
	}
	if state != string(contracts.LobbyOpen) {
		return errors.New("lobby is not open")
	}
	if time.Now().After(expiresAt) {
		_, _ = s.pool.Exec(ctx, `update lobbies set state = 'expired', updated_at = now() where id = $1 and state = 'open'`, lobbyID)
		return errors.New("lobby expired")
	}
	return nil
}

func (s *pgStore) ensureLobbyOwner(ctx context.Context, lobbyID, ownerUserID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	return ensureLobbyOwnerTx(ctx, tx, lobbyID, ownerUserID)
}

type lobbyTx interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func ensureLobbyOwnerTx(ctx context.Context, tx lobbyTx, lobbyID, ownerUserID string) error {
	var state string
	var actualOwner string
	if err := tx.QueryRow(ctx, `
		select state, owner_user_id from lobbies where id = $1
	`, lobbyID).Scan(&state, &actualOwner); err != nil {
		return err
	}
	if state != string(contracts.LobbyOpen) {
		return errors.New("lobby is not open")
	}
	if actualOwner != ownerUserID {
		return errors.New("forbidden")
	}
	return nil
}

func transferLobbyOwnerTx(ctx context.Context, tx lobbyTx, lobbyID, ownerUserID, targetUserID string) error {
	ownerUserID = strings.TrimSpace(ownerUserID)
	targetUserID = strings.TrimSpace(targetUserID)
	if ownerUserID == "" || targetUserID == "" || ownerUserID == targetUserID {
		return errors.New("invalid lobby member")
	}
	var targetActive bool
	if err := tx.QueryRow(ctx, `
		select exists(
			select 1 from lobby_members
			where lobby_id = $1 and user_id = $2 and left_at is null
		)
	`, lobbyID, targetUserID).Scan(&targetActive); err != nil {
		return err
	}
	if !targetActive {
		return pgx.ErrNoRows
	}
	if _, err := tx.Exec(ctx, `
		update lobbies set owner_user_id = $2, updated_at = now()
		where id = $1
	`, lobbyID, targetUserID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		update lobby_members
		set role = case when user_id = $2 then 'owner' else 'member' end
		where lobby_id = $1 and left_at is null
	`, lobbyID, targetUserID); err != nil {
		return err
	}
	return nil
}

func (s *pgStore) getLobby(whereClause, value string) (contracts.LobbySnapshot, bool, error) {
	if strings.TrimSpace(value) == "" {
		return contracts.LobbySnapshot{}, false, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var snap contracts.LobbySnapshot
	row := s.pool.QueryRow(ctx, `
		select l.id, l.invite_code, l.owner_user_id, l.state, l.mode, l.map_scope,
		       coalesce(l.active_match_id, l.started_match_id, ''),
		       coalesce(l.last_match_id, ''),
		       coalesce(l.started_match_id, ''),
		       l.created_at, l.expires_at
		from lobbies l
		where `+whereClause, value)
	if err := row.Scan(&snap.ID, &snap.InviteCode, &snap.OwnerUserID, &snap.State, &snap.Mode, &snap.MapScope, &snap.ActiveMatchID, &snap.LastMatchID, &snap.StartedMatchID, &snap.CreatedAt, &snap.ExpiresAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return contracts.LobbySnapshot{}, false, nil
		}
		return contracts.LobbySnapshot{}, false, err
	}
	if snap.StartedMatchID == "" {
		snap.StartedMatchID = snap.ActiveMatchID
	}
	members, err := s.listLobbyMembers(ctx, snap.ID)
	if err != nil {
		return contracts.LobbySnapshot{}, false, err
	}
	snap.Members = members
	return snap, true, nil
}

func (s *pgStore) listLobbyMembers(ctx context.Context, lobbyID string) ([]contracts.LobbyMember, error) {
	rows, err := s.pool.Query(ctx, `
		select m.user_id, u.display_name, coalesce(u.avatar_url, ''),
	       u.account_type = 'guest',
	       coalesce(u.is_admin, false),
	       coalesce(u.selected_badge_id, ''),
	       coalesce(m.team_id, ''),
	       m.role, m.ready, m.joined_at
		from lobby_members m
		join users u on u.id = m.user_id
		where m.lobby_id = $1 and m.left_at is null
		order by case when m.role = 'owner' then 0 else 1 end, m.joined_at asc
	`, lobbyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.LobbyMember{}
	for rows.Next() {
		var member contracts.LobbyMember
		var selectedBadgeID string
		if err := rows.Scan(&member.UserID, &member.DisplayName, &member.AvatarURL, &member.IsGuest, &member.IsAdmin, &selectedBadgeID, &member.TeamID, &member.Role, &member.Ready, &member.JoinedAt); err != nil {
			return nil, err
		}
		_, selectedBadge, err := s.profileBadges(ctx, member.UserID, selectedBadgeID)
		if err != nil {
			return nil, err
		}
		member.SelectedBadge = selectedBadge
		out = append(out, member)
	}
	return out, rows.Err()
}

func newLobbyID(prefix string) string {
	return prefix + "-" + randomHex(10)
}

func newLobbyCode() string {
	const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
	buf := make([]byte, 6)
	random := make([]byte, 6)
	if _, err := rand.Read(random); err != nil {
		fallback := strings.ToUpper(time.Now().Format("150405"))
		return fallback[:6]
	}
	for i, b := range random {
		buf[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(buf)
}

func randomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return strings.ToLower(time.Now().Format("150405000000"))[:n]
	}
	const hexAlphabet = "0123456789abcdef"
	out := make([]byte, n*2)
	for i, b := range buf {
		out[i*2] = hexAlphabet[b>>4]
		out[i*2+1] = hexAlphabet[b&0x0f]
	}
	return string(out[:n])
}
