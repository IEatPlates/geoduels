package persistence

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"geoduels/pkg/contracts"
)

const (
	modeDuel                        = "duel"
	defaultSeasonID                 = "s2"
	moderationProjectionAdvisoryKey = int64(0x67646d6f646572)
)

type Profile struct {
	UserID            string  `json:"userId"`
	DisplayName       string  `json:"displayName"`
	AvatarURL         string  `json:"avatarUrl,omitempty"`
	MMR               int     `json:"mmr"`
	RatingRD          float64 `json:"ratingRd,omitempty"`
	GamesPlayed       int     `json:"gamesPlayed"`
	Wins              int     `json:"wins"`
	RankedGamesPlayed int     `json:"rankedGamesPlayed"`
	RankedWins        int     `json:"rankedWins"`
	IsGuest           bool    `json:"isGuest"`
	IsAdmin           bool    `json:"isAdmin"`
	IsModerator       bool    `json:"isModerator"`
	IsBanned          bool    `json:"isBanned"`
	BanReason         string  `json:"banReason,omitempty"`
}

type LeaderboardEntry struct {
	Rank        int    `json:"rank"`
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
	MMR         int    `json:"mmr"`
	GamesPlayed int    `json:"gamesPlayed"`
	Wins        int    `json:"wins"`
}

type LeaderboardOverview struct {
	Mode         string             `json:"mode"`
	SeasonID     string             `json:"season"`
	SelfRank     int                `json:"selfRank"`
	TotalPlayers int                `json:"totalPlayers"`
	Entries      []LeaderboardEntry `json:"entries"`
}

type Identity struct {
	Sub         string
	Email       string
	GoogleName  string
	AvatarURL   string
	Onboarded   bool
	DisplayName string
	AccountType string
	IsAdmin     bool
	IsModerator bool
	IsBanned    bool
	BanReason   string
}

type AdminPlayerSummary = contracts.AdminPlayerSummary

type ModerationCaseSummary = contracts.ModerationCaseSummary
type ModerationReportSummary = contracts.ModerationReportSummary
type ModerationCaseEvent = contracts.ModerationCaseEvent
type ModerationActionSummary = contracts.ModerationActionSummary
type ModerationCaseDetail = contracts.ModerationCaseDetail
type ModerationReportCreated = contracts.ModerationReportCreated
type ModerationCaseNotificationPayload = contracts.ModerationCaseNotificationPayload

type MapRevisionSummary = contracts.MapRevisionSummary

type MatchHistorySummary struct {
	MatchID      string    `json:"matchId"`
	Mode         string    `json:"mode"`
	StartedAt    time.Time `json:"startedAt"`
	EndedAt      time.Time `json:"endedAt"`
	WinnerUserID string    `json:"winnerUserId,omitempty"`
}

type CreateModerationReportParams struct {
	MatchID        string
	ReporterUserID string
	ReportedUserID string
	Category       string
	Reason         string
}

type ModerationCaseActionParams struct {
	CaseID      int64
	ActorUserID string
	ActionType  string
	Reason      string
	Status      string
	AssignedTo  string
	MuteUserID  string
	MuteUntil   time.Time
}

type CreateDebugModerationReportsParams struct {
	ReportedUserID string
	Count          int
	Category       string
	Reason         string
	CreatedBy      string
}

type DebugModerationReportsResult struct {
	CaseID          int64    `json:"caseId"`
	ReportsCreated  int      `json:"reportsCreated"`
	ReporterUserIDs []string `json:"reporterUserIds"`
}

type NotificationOutboxItem struct {
	ID          int64
	Type        string
	PayloadJSON []byte
	Attempts    int
}

type EloRefundSummary struct {
	RefundsIssued int `json:"refundsIssued"`
	TotalRefunded int `json:"totalRefunded"`
}

type SignupIPBan struct {
	ID        int64     `json:"id"`
	IPAddress string    `json:"ipAddress"`
	Reason    string    `json:"reason,omitempty"`
	CreatedBy string    `json:"createdBy,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type LobbyChangelogContent struct {
	Eyebrow  string `json:"eyebrow"`
	Title    string `json:"title"`
	Markdown string `json:"markdown"`
}

type ModerationSettings struct {
	DiscordWebhookURL string `json:"discordWebhookUrl"`
}

type RefreshTokenRecord struct {
	ID               string
	UserID           string
	RefreshTokenHash string
	ExpiresAt        time.Time
	CreatedAt        time.Time
	LastUsedAt       time.Time
	RevokedAt        *time.Time
	UserAgent        string
	IPAddress        string
}

type AuthSessionParams struct {
	UserAgent string
	IPAddress string
}

type RuntimeMatch struct {
	MatchID    string
	State      string
	OwnerEpoch int64
	StartedAt  time.Time
	EndedAt    time.Time
}

type Store interface {
	UpsertGoogleIdentity(googleSub, email, googleName, avatarURL, linkUserID string) (Identity, error)
	GoogleIdentityExists(googleSub string) (bool, error)
	CreateGuestIdentity(displayName string) (Identity, error)
	GetIdentity(sub string) (Identity, error)
	CompleteOnboarding(sub, email, displayName string) error
	UpdateDisplayName(sub, displayName string) error
	SetUserAdmin(userID string, isAdmin bool) error
	SetUserModerator(userID string, isModerator bool) error
	SearchPlayers(query string, limit int) ([]AdminPlayerSummary, error)
	SetPlayerBan(userID, reason string, banned bool) error
	ClearReporterMute(userID string) error
	GetLobbyChangelog(defaultContent LobbyChangelogContent) (LobbyChangelogContent, error)
	SetLobbyChangelog(content LobbyChangelogContent) error
	GetModerationSettings() (ModerationSettings, error)
	SetModerationSettings(settings ModerationSettings) error
	ActivateMapRevision(mapKey, displayName string, dataset []byte) (MapRevisionSummary, error)
	CreateAuthSession(userID, refreshTokenHash string, expiresAt time.Time, params AuthSessionParams) (RefreshTokenRecord, error)
	GetAuthSessionByRefreshToken(hash string) (RefreshTokenRecord, bool, error)
	RotateAuthSession(sessionID, currentHash, nextHash string, expiresAt time.Time, usedAt time.Time) (RefreshTokenRecord, bool, error)
	RevokeAuthSession(sessionID string) error
	RevokeAuthSessionsForUser(userID string) error
	UpsertUser(userID, email, displayName string) error
	GetProfile(userID string) (Profile, error)
	ListLeaderboard(mode, seasonID string, limit, offset int) ([]LeaderboardEntry, error)
	GetLeaderboardOverview(userID, mode, seasonID string, limit int) (LeaderboardOverview, error)
	RecordMatchResult(snap contracts.MatchSnapshot) error
	RecordFinalMatchSnapshot(matchID string, snapshot []byte) error
	GetFinalMatchSnapshot(matchID string) ([]byte, bool, error)
	ListPlayerMatchHistory(userID string, limit int) ([]MatchHistorySummary, error)
	CreateModerationReport(params CreateModerationReportParams) (ModerationReportCreated, error)
	CreateDebugModerationReports(params CreateDebugModerationReportsParams) (DebugModerationReportsResult, error)
	RecomputeModerationProjections(limit int) (int, error)
	ListModerationCases(status string, limit int) ([]ModerationCaseSummary, error)
	GetModerationCase(caseID int64) (ModerationCaseDetail, error)
	AddModerationCaseAction(params ModerationCaseActionParams) (ModerationCaseDetail, error)
	IssueEloRefundsForCheater(userID string, lookback time.Duration) (EloRefundSummary, error)
	ClaimPendingNotification(notificationType string, now time.Time) (NotificationOutboxItem, bool, error)
	MarkNotificationSent(id int64) error
	MarkNotificationFailed(id int64, nextAttemptAt time.Time, lastError string) error
	AddSignupIPBan(ipAddress, reason, createdBy string) error
	RemoveSignupIPBan(ipAddress string) error
	ListSignupIPBans(limit int) ([]SignupIPBan, error)
	IsSignupIPBanned(ipAddress string) (bool, error)
	GetRuntimeMatch(matchID string) (RuntimeMatch, bool, error)
	RecordRuntimeMatch(matchID, state string, ownerEpoch int64, terminal bool) error
	ExpireStaleRuntimeMatches(prefix string, olderThan time.Duration) error
	ExpireOpenLobbies() error
	ListOpenLobbyIDs() ([]string, error)
	CloseInactiveOpenLobbies(lobbyIDs []string, inactiveFor time.Duration) (int64, error)
	CreateLobby(ownerUserID string, mode contracts.MatchMode, mapScope string, ttl time.Duration) (contracts.LobbySnapshot, error)
	GetLobbyByID(lobbyID string) (contracts.LobbySnapshot, bool, error)
	GetLobbyByInviteCode(inviteCode string) (contracts.LobbySnapshot, bool, error)
	GetLobbyByMatchID(matchID string) (contracts.LobbySnapshot, bool, error)
	JoinLobby(lobbyID, userID string) (contracts.LobbySnapshot, error)
	LeaveLobby(lobbyID, userID string) (contracts.LobbySnapshot, error)
	KickLobbyMember(lobbyID, ownerUserID, targetUserID string) (contracts.LobbySnapshot, error)
	TransferLobbyOwner(lobbyID, ownerUserID, targetUserID string) (contracts.LobbySnapshot, error)
	MarkLobbyInMatch(lobbyID, matchID string) (contracts.LobbySnapshot, error)
	ReopenEndedLobbies() (int64, error)
	Close()
}

func NewFromEnv() (Store, error) {
	url := os.Getenv("POSTGRES_URL")
	if url == "" {
		return nil, errors.New("POSTGRES_URL is required")
	}
	url = normalizeDBURLForContainer(url)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &pgStore{pool: pool}, nil
}

type pgStore struct {
	pool *pgxpool.Pool
}

func googleOnboardedAt(linkedGuest bool) any {
	if linkedGuest {
		return time.Now()
	}
	return nil
}

func chooseGoogleIdentityUser(existingGoogleUserID, existingRegisteredEmailUserID, linkUserID, linkAccountType string) (string, bool) {
	if existingGoogleUserID != "" {
		return existingGoogleUserID, false
	}
	if existingRegisteredEmailUserID != "" {
		return existingRegisteredEmailUserID, false
	}
	if linkUserID != "" && linkAccountType == "guest" {
		return linkUserID, true
	}
	return newUserID(), false
}

func (s *pgStore) UpsertGoogleIdentity(googleSub, email, googleName, avatarURL, linkUserID string) (Identity, error) {
	if googleSub == "" {
		return Identity{}, errors.New("google subject required")
	}
	if email == "" {
		email = googleSub + "@oidc.invalid"
	}
	if googleName == "" {
		googleName = googleSub
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Identity{}, err
	}
	defer tx.Rollback(ctx)

	var existingGoogleUserID string
	row := tx.QueryRow(ctx, `
		select user_id
		from user_identities
		where provider = 'google' and provider_user_id = $1
	`, googleSub)
	if err := row.Scan(&existingGoogleUserID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, err
	}
	var existingRegisteredEmailUserID string
	if existingGoogleUserID == "" {
		row = tx.QueryRow(ctx, `
			select id
			from users
			where lower(email) = lower($1)
				and account_type = 'registered'
			limit 1
		`, email)
		if err := row.Scan(&existingRegisteredEmailUserID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, err
		}
	}
	var linkAccountType string
	if existingGoogleUserID == "" && existingRegisteredEmailUserID == "" && linkUserID != "" {
		row = tx.QueryRow(ctx, `
			select account_type
			from users
			where id = $1
		`, linkUserID)
		if err := row.Scan(&linkAccountType); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, err
		}
	}
	userID, linkedGuest := chooseGoogleIdentityUser(existingGoogleUserID, existingRegisteredEmailUserID, linkUserID, linkAccountType)
	onboardedAt := googleOnboardedAt(linkedGuest)

	if _, err := tx.Exec(ctx, `
		insert into users (id, email, display_name, avatar_url, onboarded_at, account_type)
		values ($1, $2, $3, $4, $5, 'registered')
		on conflict (id) do update set
			email = excluded.email,
			display_name = case
				when users.onboarded_at is not null and nullif(users.display_name, '') is not null then users.display_name
				else excluded.display_name
			end,
			avatar_url = excluded.avatar_url,
			onboarded_at = coalesce(users.onboarded_at, excluded.onboarded_at),
			account_type = 'registered'
	`, userID, email, googleName, nullable(avatarURL), onboardedAt); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into user_identities(user_id, provider, provider_user_id, email, provider_name, avatar_url, last_seen_at)
		values($1, 'google', $2, $3, $4, $5, now())
		on conflict (provider, provider_user_id) do update set
			user_id = excluded.user_id,
			email = excluded.email,
			provider_name = excluded.provider_name,
			avatar_url = case
				when excluded.avatar_url is null then user_identities.avatar_url
				when excluded.avatar_url = '' then user_identities.avatar_url
				else excluded.avatar_url
			end,
			last_seen_at = now()
	`, userID, googleSub, email, googleName, nullable(avatarURL)); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into ranks (user_id, mode, mmr, season_id)
		values ($1, $2, $4, $3)
		on conflict (user_id, mode, season_id) do nothing
	`, userID, modeDuel, defaultSeasonID, initialMMR); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into user_stats (user_id, games_played, wins)
		values ($1, 0, 0)
		on conflict (user_id) do nothing
	`, userID); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into ranked_stats (user_id, mode, season_id, games_played, wins)
		values ($1, $2, $3, 0, 0)
		on conflict (user_id, mode, season_id) do nothing
	`, userID, modeDuel, defaultSeasonID); err != nil {
		return Identity{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Identity{}, err
	}
	return s.GetIdentity(userID)
}

func (s *pgStore) GoogleIdentityExists(googleSub string) (bool, error) {
	if strings.TrimSpace(googleSub) == "" {
		return false, errors.New("google subject required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(
			select 1 from user_identities
			where provider = 'google' and provider_user_id = $1
		)
	`, googleSub).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (s *pgStore) CreateGuestIdentity(displayName string) (Identity, error) {
	userID := newUserID()
	if displayName == "" {
		displayName = "Guest"
	}
	if err := s.UpsertUser(userID, "", displayName); err != nil {
		return Identity{}, err
	}
	return s.GetIdentity(userID)
}

func (s *pgStore) GetIdentity(sub string) (Identity, error) {
	if sub == "" {
		return Identity{}, errors.New("subject required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		select
			u.id,
			coalesce(u.email, ''),
			coalesce(ui.provider_name, ''),
			coalesce(u.avatar_url, ui.avatar_url, ''),
			coalesce(u.onboarded_at is not null, false) as onboarded,
				coalesce(nullif(u.display_name, ''), ui.provider_name, u.id),
				u.account_type,
				coalesce(u.is_admin, false),
				coalesce(u.is_moderator, false),
				coalesce(u.banned_at is not null, false),
				coalesce(u.ban_reason, '')
		from users u
		left join lateral (
			select provider_name, avatar_url
			from user_identities
			where user_id = u.id and provider = 'google'
			order by created_at asc
			limit 1
		) ui on true
		where u.id = $1
	`, sub)
	var out Identity
	if err := row.Scan(
		&out.Sub,
		&out.Email,
		&out.GoogleName,
		&out.AvatarURL,
		&out.Onboarded,
		&out.DisplayName,
		&out.AccountType,
		&out.IsAdmin,
		&out.IsModerator,
		&out.IsBanned,
		&out.BanReason,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, errors.New("identity not found")
		}
		return Identity{}, err
	}
	return out, nil
}

func (s *pgStore) CompleteOnboarding(sub, email, displayName string) error {
	if sub == "" {
		return errors.New("subject required")
	}
	if displayName == "" {
		return errors.New("display name required")
	}
	var nullableEmail any
	if email != "" {
		nullableEmail = email
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update users
		set email = coalesce($2, email),
			display_name = $3,
			onboarded_at = coalesce(onboarded_at, now())
		where id = $1
	`, sub, nullableEmail, displayName)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (s *pgStore) UpdateDisplayName(sub, displayName string) error {
	if sub == "" {
		return errors.New("subject required")
	}
	if displayName == "" {
		return errors.New("display name required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update users
		set display_name = $2
		where id = $1
	`, sub, displayName)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (s *pgStore) SetUserAdmin(userID string, isAdmin bool) error {
	if userID == "" {
		return errors.New("user id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update users
		set is_admin = $2
		where id = $1
	`, userID, isAdmin)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (s *pgStore) SetUserModerator(userID string, isModerator bool) error {
	if userID == "" {
		return errors.New("user id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update users
		set is_moderator = $2
		where id = $1
	`, userID, isModerator)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (s *pgStore) SearchPlayers(query string, limit int) ([]AdminPlayerSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	pattern := "%"
	trimmed := strings.TrimSpace(query)
	if trimmed != "" {
		pattern = "%" + strings.ToLower(trimmed) + "%"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	rows, err := s.pool.Query(ctx, `
		select
			u.id,
			coalesce(u.email, ''),
			coalesce(nullif(u.display_name, ''), ui.provider_name, u.id),
			coalesce(u.avatar_url, ui.avatar_url, ''),
			coalesce(r.mmr, $3),
				coalesce(us.games_played, 0),
				coalesce(us.wins, 0),
				coalesce(rs.games_played, 0),
				coalesce(u.account_type = 'guest', false),
				coalesce(u.is_admin, false),
				coalesce(u.is_moderator, false),
				coalesce(u.banned_at is not null, false),
				coalesce(u.ban_reason, ''),
			u.banned_at,
			coalesce(latest_session.ip_address, ''),
			rep.muted_until
		from users u
		left join lateral (
			select provider_name, avatar_url
			from user_identities
			where user_id = u.id and provider = 'google'
			order by created_at asc
			limit 1
		) ui on true
		left join lateral (
			select ip_address
			from auth_sessions
			where user_id = u.id and coalesce(ip_address, '') <> ''
			order by last_used_at desc, created_at desc
			limit 1
		) latest_session on true
		left join ranks r on r.user_id = u.id and r.mode = $1 and r.season_id = $2
		left join user_stats us on us.user_id = u.id
		left join ranked_stats rs on rs.user_id = u.id and rs.mode = $1 and rs.season_id = $2
		left join moderation_reporter_reputation rep on rep.user_id = u.id
		where $4 = '%%'
		   or lower(u.id) like $4
		   or lower(coalesce(u.email, '')) like $4
		   or lower(coalesce(u.display_name, ui.provider_name, '')) like $4
		order by u.created_at desc, u.id desc
		limit $5
	`, modeDuel, defaultSeasonID, initialMMR, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]AdminPlayerSummary, 0, limit)
	for rows.Next() {
		var item AdminPlayerSummary
		var bannedAt *time.Time
		var reportMutedUntil *time.Time
		if err := rows.Scan(
			&item.UserID,
			&item.Email,
			&item.DisplayName,
			&item.AvatarURL,
			&item.MMR,
			&item.GamesPlayed,
			&item.Wins,
			&item.RankedGamesPlayed,
			&item.IsGuest,
			&item.IsAdmin,
			&item.IsModerator,
			&item.IsBanned,
			&item.BanReason,
			&bannedAt,
			&item.LastIPAddress,
			&reportMutedUntil,
		); err != nil {
			return nil, err
		}
		if bannedAt != nil {
			item.BannedAt = *bannedAt
		}
		if reportMutedUntil != nil {
			item.ReportMutedUntil = *reportMutedUntil
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *pgStore) getAdminPlayerSummary(ctx context.Context, userID string) (AdminPlayerSummary, error) {
	var item AdminPlayerSummary
	var bannedAt *time.Time
	var reportMutedUntil *time.Time
	err := s.pool.QueryRow(ctx, `
		select
			u.id,
			coalesce(u.email, ''),
			coalesce(nullif(u.display_name, ''), ui.provider_name, u.id),
			coalesce(u.avatar_url, ui.avatar_url, ''),
			coalesce(r.mmr, $4),
			coalesce(us.games_played, 0),
			coalesce(us.wins, 0),
			coalesce(rs.games_played, 0),
			coalesce(u.account_type = 'guest', false),
			coalesce(u.is_admin, false),
			coalesce(u.is_moderator, false),
			coalesce(u.banned_at is not null, false),
			coalesce(u.ban_reason, ''),
			u.banned_at,
			coalesce(latest_session.ip_address, ''),
			rep.muted_until
		from users u
		left join lateral (
			select provider_name, avatar_url
			from user_identities
			where user_id = u.id and provider = 'google'
			order by created_at asc
			limit 1
		) ui on true
		left join lateral (
			select ip_address
			from auth_sessions
			where user_id = u.id and coalesce(ip_address, '') <> ''
			order by last_used_at desc, created_at desc
			limit 1
		) latest_session on true
		left join ranks r on r.user_id = u.id and r.mode = $2 and r.season_id = $3
		left join user_stats us on us.user_id = u.id
		left join ranked_stats rs on rs.user_id = u.id and rs.mode = $2 and rs.season_id = $3
		left join moderation_reporter_reputation rep on rep.user_id = u.id
		where u.id = $1
	`, userID, modeDuel, defaultSeasonID, initialMMR).Scan(
		&item.UserID,
		&item.Email,
		&item.DisplayName,
		&item.AvatarURL,
		&item.MMR,
		&item.GamesPlayed,
		&item.Wins,
		&item.RankedGamesPlayed,
		&item.IsGuest,
		&item.IsAdmin,
		&item.IsModerator,
		&item.IsBanned,
		&item.BanReason,
		&bannedAt,
		&item.LastIPAddress,
		&reportMutedUntil,
	)
	if err != nil {
		return AdminPlayerSummary{}, err
	}
	if bannedAt != nil {
		item.BannedAt = *bannedAt
	}
	if reportMutedUntil != nil {
		item.ReportMutedUntil = *reportMutedUntil
	}
	return item, nil
}

func (s *pgStore) SetPlayerBan(userID, reason string, banned bool) error {
	if userID == "" {
		return errors.New("user id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var bannedAt any
	var banReason any
	if banned {
		bannedAt = time.Now()
		if strings.TrimSpace(reason) != "" {
			banReason = strings.TrimSpace(reason)
		}
	}
	tag, err := s.pool.Exec(ctx, `
		update users
		set banned_at = $2,
			ban_reason = $3
		where id = $1
	`, userID, bannedAt, banReason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (s *pgStore) ClearReporterMute(userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return errors.New("user id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tag, err := s.pool.Exec(ctx, `
		update moderation_reporter_reputation
		set muted_until = null,
			report_weight = greatest(report_weight, 0.05),
			updated_at = now()
		where user_id = $1
	`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		_, err = s.pool.Exec(ctx, `
			insert into moderation_reporter_reputation(user_id, muted_until, report_weight, updated_at)
			values($1, null, 1, now())
		`, userID)
	}
	return err
}

func (s *pgStore) GetLobbyChangelog(defaultContent LobbyChangelogContent) (LobbyChangelogContent, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var raw string
	err := s.pool.QueryRow(ctx, `
		select value_json::text
		from site_settings
		where key = 'lobby_changelog'
	`).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return defaultContent, nil
		}
		return LobbyChangelogContent{}, err
	}
	var content LobbyChangelogContent
	if err := json.Unmarshal([]byte(raw), &content); err != nil {
		return defaultContent, nil
	}
	if strings.TrimSpace(content.Eyebrow) == "" {
		content.Eyebrow = defaultContent.Eyebrow
	}
	if strings.TrimSpace(content.Title) == "" {
		content.Title = defaultContent.Title
	}
	if strings.TrimSpace(content.Markdown) == "" {
		content.Markdown = defaultContent.Markdown
	}
	return content, nil
}

func (s *pgStore) SetLobbyChangelog(content LobbyChangelogContent) error {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	payload, err := json.Marshal(content)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		insert into site_settings(key, value_json, updated_at)
		values('lobby_changelog', $1::jsonb, now())
		on conflict (key) do update set
			value_json = excluded.value_json,
			updated_at = now()
	`, string(payload))
	return err
}

func (s *pgStore) GetModerationSettings() (ModerationSettings, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var raw string
	err := s.pool.QueryRow(ctx, `
		select value_json::text
		from site_settings
		where key = 'moderation_settings'
	`).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ModerationSettings{}, nil
		}
		return ModerationSettings{}, err
	}
	var settings ModerationSettings
	if err := json.Unmarshal([]byte(raw), &settings); err != nil {
		return ModerationSettings{}, nil
	}
	settings.DiscordWebhookURL = strings.TrimSpace(settings.DiscordWebhookURL)
	return settings, nil
}

func (s *pgStore) SetModerationSettings(settings ModerationSettings) error {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	settings.DiscordWebhookURL = strings.TrimSpace(settings.DiscordWebhookURL)
	payload, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		insert into site_settings(key, value_json, updated_at)
		values('moderation_settings', $1::jsonb, now())
		on conflict (key) do update set
			value_json = excluded.value_json,
			updated_at = now()
	`, string(payload))
	return err
}

func (s *pgStore) ActivateMapRevision(mapKey, displayName string, dataset []byte) (MapRevisionSummary, error) {
	if strings.TrimSpace(mapKey) == "" {
		return MapRevisionSummary{}, errors.New("map key required")
	}
	rows, err := parseMapRows(dataset)
	if err != nil {
		return MapRevisionSummary{}, err
	}
	if len(rows) == 0 {
		return MapRevisionSummary{}, errors.New("no valid rows")
	}
	if strings.TrimSpace(displayName) == "" {
		displayName = mapKey
	}
	sum := sha1.Sum(dataset)
	contentHash := hex.EncodeToString(sum[:])
	revisionID := mapKey + "-" + contentHash[:12]

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MapRevisionSummary{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		insert into maps(map_key, display_name)
		values($1, $2)
		on conflict (map_key) do update set
			display_name = excluded.display_name
	`, mapKey, displayName); err != nil {
		return MapRevisionSummary{}, err
	}

	inserted := true
	var existing string
	err = tx.QueryRow(ctx, `select id from map_revisions where map_key = $1 and content_hash = $2 limit 1`, mapKey, contentHash).Scan(&existing)
	if err == nil {
		revisionID = existing
		inserted = false
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return MapRevisionSummary{}, err
	} else {
		if _, err := tx.Exec(ctx, `
			insert into map_revisions(id, map_key, content_hash, status, row_count)
			values($1, $2, $3, 'validated', 0)
		`, revisionID, mapKey, contentHash); err != nil {
			return MapRevisionSummary{}, err
		}
	}

	if inserted {
		block := make([][]any, 0, len(rows))
		for _, r := range rows {
			block = append(block, []any{revisionID, r.Lat, r.Lng, r.Country, r.PanoID, r.Heading, r.Pitch, r.RandKey})
		}
		if _, err := tx.CopyFrom(
			ctx,
			pgx.Identifier{"locations"},
			[]string{"map_revision_id", "lat", "lng", "country", "pano_id", "heading", "pitch", "rand_key"},
			pgx.CopyFromRows(block),
		); err != nil {
			return MapRevisionSummary{}, err
		}
	}

	if _, err := tx.Exec(ctx, `update map_revisions set row_count = $2, status = 'active' where id = $1`, revisionID, len(rows)); err != nil {
		return MapRevisionSummary{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into map_aliases(map_key, active_revision_id, updated_at)
		values($1, $2, now())
		on conflict (map_key) do update set
			rollback_revision_id = map_aliases.active_revision_id,
			active_revision_id = excluded.active_revision_id,
			updated_at = now()
	`, mapKey, revisionID); err != nil {
		return MapRevisionSummary{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return MapRevisionSummary{}, err
	}
	return MapRevisionSummary{
		MapKey:      mapKey,
		RevisionID:  revisionID,
		RowCount:    len(rows),
		Inserted:    inserted,
		DisplayName: displayName,
	}, nil
}

func (s *pgStore) CreateAuthSession(userID, refreshTokenHash string, expiresAt time.Time, params AuthSessionParams) (RefreshTokenRecord, error) {
	if userID == "" || refreshTokenHash == "" {
		return RefreshTokenRecord{}, errors.New("userID and refresh token hash required")
	}
	sessionID := newUserID()
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		insert into auth_sessions(
			id,
			user_id,
			refresh_token_hash,
			expires_at,
			created_at,
			last_used_at,
			user_agent,
			ip_address
		)
		values($1, $2, $3, $4, now(), now(), $5, $6)
		returning
			id,
			user_id,
			refresh_token_hash,
			expires_at,
			created_at,
			last_used_at,
			revoked_at,
			coalesce(user_agent, ''),
			coalesce(ip_address, '')
	`, sessionID, userID, refreshTokenHash, expiresAt, nullable(params.UserAgent), nullable(params.IPAddress))
	var rec RefreshTokenRecord
	if err := row.Scan(
		&rec.ID,
		&rec.UserID,
		&rec.RefreshTokenHash,
		&rec.ExpiresAt,
		&rec.CreatedAt,
		&rec.LastUsedAt,
		&rec.RevokedAt,
		&rec.UserAgent,
		&rec.IPAddress,
	); err != nil {
		return RefreshTokenRecord{}, err
	}
	return rec, nil
}

func (s *pgStore) GetAuthSessionByRefreshToken(hash string) (RefreshTokenRecord, bool, error) {
	if hash == "" {
		return RefreshTokenRecord{}, false, errors.New("hash required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		select
			id,
			user_id,
			refresh_token_hash,
			expires_at,
			created_at,
			last_used_at,
			revoked_at,
			coalesce(user_agent, ''),
			coalesce(ip_address, '')
		from auth_sessions
		where refresh_token_hash = $1
	`, hash)
	var rec RefreshTokenRecord
	if err := row.Scan(
		&rec.ID,
		&rec.UserID,
		&rec.RefreshTokenHash,
		&rec.ExpiresAt,
		&rec.CreatedAt,
		&rec.LastUsedAt,
		&rec.RevokedAt,
		&rec.UserAgent,
		&rec.IPAddress,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshTokenRecord{}, false, nil
		}
		return RefreshTokenRecord{}, false, err
	}
	return rec, true, nil
}

func (s *pgStore) RotateAuthSession(sessionID, currentHash, nextHash string, expiresAt time.Time, usedAt time.Time) (RefreshTokenRecord, bool, error) {
	if sessionID == "" || currentHash == "" || nextHash == "" {
		return RefreshTokenRecord{}, false, errors.New("session id and token hashes required")
	}
	if usedAt.IsZero() {
		usedAt = time.Now()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		update auth_sessions
		set refresh_token_hash = $3,
			expires_at = $4,
			last_used_at = $5
		where id = $1
		  and refresh_token_hash = $2
		  and revoked_at is null
		returning
			id,
			user_id,
			refresh_token_hash,
			expires_at,
			created_at,
			last_used_at,
			revoked_at,
			coalesce(user_agent, ''),
			coalesce(ip_address, '')
	`, sessionID, currentHash, nextHash, expiresAt, usedAt)
	var rec RefreshTokenRecord
	if err := row.Scan(
		&rec.ID,
		&rec.UserID,
		&rec.RefreshTokenHash,
		&rec.ExpiresAt,
		&rec.CreatedAt,
		&rec.LastUsedAt,
		&rec.RevokedAt,
		&rec.UserAgent,
		&rec.IPAddress,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshTokenRecord{}, false, nil
		}
		return RefreshTokenRecord{}, false, err
	}
	return rec, true, nil
}

func (s *pgStore) RevokeAuthSession(sessionID string) error {
	if sessionID == "" {
		return errors.New("session id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update auth_sessions
		set revoked_at = coalesce(revoked_at, now())
		where id = $1
	`, sessionID)
	return err
}

func (s *pgStore) RevokeAuthSessionsForUser(userID string) error {
	if userID == "" {
		return errors.New("userID required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update auth_sessions
		set revoked_at = coalesce(revoked_at, now())
		where user_id = $1 and revoked_at is null
	`, userID)
	return err
}

func (s *pgStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

func (s *pgStore) UpsertUser(userID, email, displayName string) error {
	if userID == "" {
		return errors.New("user id required")
	}
	if displayName == "" {
		displayName = userID
	}
	var nullableEmail any
	if email != "" {
		nullableEmail = email
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		insert into users (id, email, display_name, avatar_url, onboarded_at, account_type)
		values ($1, $2, $3, null, now(), 'guest')
		on conflict (id) do update set
			email = excluded.email,
			display_name = excluded.display_name,
			onboarded_at = coalesce(users.onboarded_at, excluded.onboarded_at)
	`, userID, nullableEmail, displayName); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into ranks (user_id, mode, mmr, season_id)
		values ($1, $2, $4, $3)
		on conflict (user_id, mode, season_id) do nothing
	`, userID, modeDuel, defaultSeasonID, initialMMR); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into user_stats (user_id, games_played, wins)
		values ($1, 0, 0)
		on conflict (user_id) do nothing
	`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into ranked_stats (user_id, mode, season_id, games_played, wins)
		values ($1, $2, $3, 0, 0)
		on conflict (user_id, mode, season_id) do nothing
	`, userID, modeDuel, defaultSeasonID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) GetProfile(userID string) (Profile, error) {
	p := Profile{UserID: userID, DisplayName: userID, MMR: initialMMR, RatingRD: initialRatingRD}
	if userID == "" {
		return p, errors.New("user id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		select
			coalesce(nullif(u.display_name, seed.user_id), ui.provider_name, $1) as display_name,
			coalesce(u.avatar_url, ui.avatar_url, '') as avatar_url,
			coalesce(r.mmr, $4) as mmr,
			coalesce(r.rd, $5) as rating_rd,
			coalesce(us.games_played, 0) as games_played,
			coalesce(us.wins, 0) as wins,
			coalesce(rs.games_played, 0) as ranked_games_played,
				coalesce(rs.wins, 0) as ranked_wins,
				coalesce(u.account_type = 'guest', false) as is_guest,
				coalesce(u.is_admin, false) as is_admin,
				coalesce(u.is_moderator, false) as is_moderator,
				coalesce(u.banned_at is not null, false) as is_banned,
				coalesce(u.ban_reason, '') as ban_reason
		from (select $1 as user_id) seed
		left join users u on u.id = seed.user_id
		left join lateral (
			select provider_name, avatar_url
			from user_identities
			where user_id = seed.user_id and provider = 'google'
			order by created_at asc
			limit 1
		) ui on true
		left join ranks r on r.user_id = seed.user_id and r.mode = $2 and r.season_id = $3
		left join user_stats us on us.user_id = seed.user_id
		left join ranked_stats rs on rs.user_id = seed.user_id and rs.mode = $2 and rs.season_id = $3
	`, userID, modeDuel, defaultSeasonID, initialMMR, initialRatingRD)
	if err := row.Scan(
		&p.DisplayName,
		&p.AvatarURL,
		&p.MMR,
		&p.RatingRD,
		&p.GamesPlayed,
		&p.Wins,
		&p.RankedGamesPlayed,
		&p.RankedWins,
		&p.IsGuest,
		&p.IsAdmin,
		&p.IsModerator,
		&p.IsBanned,
		&p.BanReason,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return p, nil
		}
		return p, err
	}
	return p, nil
}

func (s *pgStore) ListLeaderboard(mode, seasonID string, limit, offset int) ([]LeaderboardEntry, error) {
	if mode == "" {
		mode = modeDuel
	}
	if seasonID == "" {
		seasonID = defaultSeasonID
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	rows, err := s.pool.Query(ctx, `
		select
			row_number() over (
				order by r.mmr desc, r.updated_at asc, r.user_id asc
			) as rank,
			r.user_id,
			coalesce(nullif(u.display_name, r.user_id), ui.provider_name, r.user_id) as display_name,
			coalesce(u.avatar_url, ui.avatar_url, '') as avatar_url,
			r.mmr,
			coalesce(rs.games_played, 0) as games_played,
			coalesce(rs.wins, 0) as wins
		from ranks r
		left join users u on u.id = r.user_id
		left join lateral (
			select provider_name, avatar_url
			from user_identities
			where user_id = r.user_id and provider = 'google'
			order by created_at asc
			limit 1
		) ui on true
		left join ranked_stats rs on rs.user_id = r.user_id and rs.mode = r.mode and rs.season_id = r.season_id
		where r.mode = $1
			and r.season_id = $2
			and coalesce(u.account_type, 'registered') <> 'guest'
			and u.banned_at is null
		order by r.mmr desc, r.updated_at asc, r.user_id asc
		limit $3 offset $4
	`, mode, seasonID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]LeaderboardEntry, 0, limit)
	for rows.Next() {
		var entry LeaderboardEntry
		if err := rows.Scan(
			&entry.Rank,
			&entry.UserID,
			&entry.DisplayName,
			&entry.AvatarURL,
			&entry.MMR,
			&entry.GamesPlayed,
			&entry.Wins,
		); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return entries, nil
}

func (s *pgStore) GetLeaderboardOverview(userID, mode, seasonID string, limit int) (LeaderboardOverview, error) {
	if mode == "" {
		mode = modeDuel
	}
	if seasonID == "" {
		seasonID = defaultSeasonID
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	entries, err := s.ListLeaderboard(mode, seasonID, limit, 0)
	if err != nil {
		return LeaderboardOverview{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	var selfRank, totalPlayers int
	if err := s.pool.QueryRow(ctx, `
		with ranked as (
			select
				r.user_id,
				row_number() over (
					order by r.mmr desc, r.updated_at asc, r.user_id asc
				) as rank,
				count(*) over () as total_players
				from ranks r
				left join users u on u.id = r.user_id
				where r.mode = $1
					and r.season_id = $2
					and coalesce(u.account_type, 'registered') <> 'guest'
					and u.banned_at is null
			)
		select
			coalesce(max(rank) filter (where user_id = $3), 0) as self_rank,
			coalesce(max(total_players), 0) as total_players
		from ranked
	`, mode, seasonID, userID).Scan(&selfRank, &totalPlayers); err != nil {
		return LeaderboardOverview{}, err
	}

	return LeaderboardOverview{
		Mode:         mode,
		SeasonID:     seasonID,
		SelfRank:     selfRank,
		TotalPlayers: totalPlayers,
		Entries:      entries,
	}, nil
}

func (s *pgStore) RecordMatchResult(snap contracts.MatchSnapshot) error {
	if len(snap.Players) != 2 {
		return nil
	}
	ids := make([]string, 0, 2)
	for id := range snap.Players {
		ids = append(ids, id)
	}
	p1 := snap.Players[ids[0]]
	p2 := snap.Players[ids[1]]
	winner := ""
	if p1.HP > p2.HP {
		winner = p1.UserID
	} else if p2.HP > p1.HP {
		winner = p2.UserID
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	ensure := func(p contracts.PlayerState) error {
		if p.UserID == "" {
			return errors.New("player user id missing")
		}
		name := p.DisplayName
		if name == "" {
			name = p.UserID
		}
		if _, err := tx.Exec(ctx, `
			insert into users (id, email, display_name, avatar_url, onboarded_at, account_type)
			values ($1, $2, $3, null, now(), 'guest')
			on conflict (id) do nothing
		`, p.UserID, nil, name); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into ranks (user_id, mode, mmr, season_id)
			values ($1, $2, $4, $3)
			on conflict (user_id, mode, season_id) do nothing
			`, p.UserID, modeDuel, defaultSeasonID, initialMMR); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into user_stats (user_id, games_played, wins)
			values ($1, 0, 0)
			on conflict (user_id) do nothing
		`, p.UserID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into ranked_stats (user_id, mode, season_id, games_played, wins)
			values ($1, $2, $3, 0, 0)
			on conflict (user_id, mode, season_id) do nothing
		`, p.UserID, modeDuel, defaultSeasonID); err != nil {
			return err
		}
		return nil
	}
	if err := ensure(p1); err != nil {
		return err
	}
	if err := ensure(p2); err != nil {
		return err
	}

	var (
		p1Rating, p2Rating RatingState
		p1Guest, p2Guest   bool
	)
	if err := tx.QueryRow(ctx, `
		select account_type = 'guest'
		from users
		where id = $1
	`, p1.UserID).Scan(&p1Guest); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, `
		select account_type = 'guest'
		from users
		where id = $1
	`, p2.UserID).Scan(&p2Guest); err != nil {
		return err
	}
	matchWinner := ""
	if winner == p1.UserID {
		matchWinner = "p1"
	} else if winner == p2.UserID {
		matchWinner = "p2"
	}
	privateLobbyMatch, err := s.matchBelongsToLobby(ctx, tx, snap.MatchID)
	if err != nil {
		return err
	}
	ratedMatch := !snap.Unranked && !privateLobbyMatch && (!p1Guest || !p2Guest)
	now := time.Now()
	p1Update := RatingUpdate{MMR: p1.MMR, RD: clampRatingRD(p1.RatingRD)}
	p2Update := RatingUpdate{MMR: p2.MMR, RD: clampRatingRD(p2.RatingRD)}
	if ratedMatch {
		if err := tx.QueryRow(ctx, `
			select mmr, rd, updated_at
			from ranks
			where user_id=$1 and mode=$2 and season_id=$3
			for update
		`, p1.UserID, modeDuel, defaultSeasonID).Scan(&p1Rating.MMR, &p1Rating.RD, &p1Rating.UpdatedAt); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			select mmr, rd, updated_at
			from ranks
			where user_id=$1 and mode=$2 and season_id=$3
			for update
		`, p2.UserID, modeDuel, defaultSeasonID).Scan(&p2Rating.MMR, &p2Rating.RD, &p2Rating.UpdatedAt); err != nil {
			return err
		}
		p1Update, p2Update = CalculateDuelRatingUpdates(p1Rating, p2Rating, matchWinner, now)
	}
	if ratedMatch && !p1Guest {
		if _, err := tx.Exec(ctx, `
			update ranks set mmr=$2, rd=$5, updated_at=$6
			where user_id=$1 and mode=$3 and season_id=$4
		`, p1.UserID, p1Update.MMR, modeDuel, defaultSeasonID, p1Update.RD, now); err != nil {
			return err
		}
	}
	if ratedMatch && !p2Guest {
		if _, err := tx.Exec(ctx, `
			update ranks set mmr=$2, rd=$5, updated_at=$6
			where user_id=$1 and mode=$3 and season_id=$4
		`, p2.UserID, p2Update.MMR, modeDuel, defaultSeasonID, p2Update.RD, now); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		update user_stats
		set games_played = games_played + 1,
			wins = wins + case when user_id = $2 then 1 else 0 end,
			updated_at = now()
		where user_id = $1
	`, p1.UserID, winner); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		update user_stats
		set games_played = games_played + 1,
			wins = wins + case when user_id = $2 then 1 else 0 end,
			updated_at = now()
		where user_id = $1
	`, p2.UserID, winner); err != nil {
		return err
	}
	if ratedMatch && !p1Guest {
		if _, err := tx.Exec(ctx, `
			update ranked_stats
			set games_played = games_played + 1,
				wins = wins + case when user_id = $2 then 1 else 0 end,
				updated_at = now()
			where user_id = $1 and mode = $3 and season_id = $4
		`, p1.UserID, winner, modeDuel, defaultSeasonID); err != nil {
			return err
		}
	}
	if ratedMatch && !p2Guest {
		if _, err := tx.Exec(ctx, `
			update ranked_stats
			set games_played = games_played + 1,
				wins = wins + case when user_id = $2 then 1 else 0 end,
				updated_at = now()
			where user_id = $1 and mode = $3 and season_id = $4
		`, p2.UserID, winner, modeDuel, defaultSeasonID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *pgStore) matchBelongsToLobby(ctx context.Context, tx pgx.Tx, matchID string) (bool, error) {
	if matchID == "" {
		return false, nil
	}
	var exists bool
	if err := tx.QueryRow(ctx, `
		select exists (
			select 1
			from lobbies
			where active_match_id = $1
			   or started_match_id = $1
			   or last_match_id = $1
		)
	`, matchID).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (s *pgStore) RecordFinalMatchSnapshot(matchID string, snapshot []byte) error {
	if matchID == "" {
		return errors.New("matchID required")
	}
	var snap contracts.MatchSnapshot
	if err := json.Unmarshal(snapshot, &snap); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		insert into runtime_snapshots(match_id, seq, snapshot_json, persisted_at)
		values($1, 9223372036854775807, $2::jsonb, now())
	`, matchID, string(snapshot)); err != nil {
		return err
	}
	if err := recordMatchHistory(ctx, tx, matchID, snap, string(snapshot)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func recordMatchHistory(ctx context.Context, tx pgx.Tx, matchID string, snap contracts.MatchSnapshot, rawSnapshot string) error {
	if matchID == "" {
		matchID = snap.MatchID
	}
	if matchID == "" || len(snap.Players) == 0 {
		return nil
	}
	startedAt := snapshotStartedAt(snap)
	endedAt := time.Now()
	winner := snapshotWinner(snap)
	if _, err := tx.Exec(ctx, `
		insert into match_history(match_id, mode, state, started_at, ended_at, winner_user_id, snapshot_json)
		values($1, $2, $3, $4, $5, nullif($6, ''), $7::jsonb)
		on conflict (match_id) do update set
			mode = excluded.mode,
			state = excluded.state,
			started_at = excluded.started_at,
			ended_at = excluded.ended_at,
			winner_user_id = excluded.winner_user_id,
			snapshot_json = excluded.snapshot_json
	`, matchID, string(snap.Mode), string(snap.State), startedAt, endedAt, winner, rawSnapshot); err != nil {
		return err
	}
	for userID, player := range snap.Players {
		displayName := player.DisplayName
		if displayName == "" {
			displayName = userID
		}
		if _, err := tx.Exec(ctx, `
			insert into match_players(match_id, user_id, display_name, mmr, hp)
			values($1, $2, $3, $4, $5)
			on conflict (match_id, user_id) do update set
				display_name = excluded.display_name,
				mmr = excluded.mmr,
				hp = excluded.hp
		`, matchID, userID, displayName, player.MMR, player.HP); err != nil {
			return err
		}
	}
	for _, round := range snap.RoundResults {
		if round == nil {
			continue
		}
		for userID, result := range round.Players {
			guessUnixMS := nullableInt64(result.GuessUnixMS)
			guessMS := nullableInt64(result.GuessMS)
			if _, err := tx.Exec(ctx, `
				insert into match_round_guesses(
					match_id, round_id, round_number, user_id, lat, lng, actual_lat, actual_lng,
					distance_km, score, guess_unix_ms, guess_ms
				)
				values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
				on conflict (match_id, round_id, user_id) do update set
					lat = excluded.lat,
					lng = excluded.lng,
					actual_lat = excluded.actual_lat,
					actual_lng = excluded.actual_lng,
					distance_km = excluded.distance_km,
					score = excluded.score,
					guess_unix_ms = excluded.guess_unix_ms,
					guess_ms = excluded.guess_ms
			`, matchID, round.RoundID, round.RoundNumber, userID, result.Lat, result.Lng, round.ActualLocation.Lat, round.ActualLocation.Lng, result.DistanceKm, result.Score, guessUnixMS, guessMS); err != nil {
				return err
			}
		}
	}
	return nil
}

func snapshotStartedAt(snap contracts.MatchSnapshot) time.Time {
	if len(snap.RoundResults) > 0 {
		first := snap.RoundResults[0]
		if first != nil {
			for _, player := range first.Players {
				if player.GuessUnixMS > 0 {
					t := time.UnixMilli(player.GuessUnixMS - player.GuessMS)
					if !t.IsZero() {
						return t
					}
				}
			}
		}
	}
	if snap.PhaseStartedAt > 0 {
		return time.UnixMilli(snap.PhaseStartedAt)
	}
	return time.Now()
}

func snapshotWinner(snap contracts.MatchSnapshot) string {
	if snap.Mode == contracts.ModeSingleplayer {
		return ""
	}
	winner := ""
	winnerHP := -1
	tie := false
	for userID, player := range snap.Players {
		if player.HP > winnerHP {
			winner = userID
			winnerHP = player.HP
			tie = false
		} else if player.HP == winnerHP {
			tie = true
		}
	}
	if tie {
		return ""
	}
	return winner
}

func nullableInt64(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}

func (s *pgStore) GetFinalMatchSnapshot(matchID string) ([]byte, bool, error) {
	if matchID == "" {
		return nil, false, errors.New("matchID required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		select snapshot_json::text
		from runtime_snapshots
		where match_id = $1
		order by seq desc
		limit 1
	`, matchID)
	var raw string
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return []byte(raw), true, nil
}

func (s *pgStore) ListPlayerMatchHistory(userID string, limit int) ([]MatchHistorySummary, error) {
	if userID == "" {
		return nil, errors.New("userID required")
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	rows, err := s.pool.Query(ctx, `
		select h.match_id, h.mode, h.started_at, h.ended_at, coalesce(h.winner_user_id, '')
		from match_history h
		join match_players p on p.match_id = h.match_id
		where p.user_id = $1
		order by h.ended_at desc, h.match_id desc
		limit $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]MatchHistorySummary, 0, limit)
	for rows.Next() {
		var item MatchHistorySummary
		if err := rows.Scan(&item.MatchID, &item.Mode, &item.StartedAt, &item.EndedAt, &item.WinnerUserID); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *pgStore) CreateModerationReport(params CreateModerationReportParams) (ModerationReportCreated, error) {
	params.MatchID = strings.TrimSpace(params.MatchID)
	params.ReporterUserID = strings.TrimSpace(params.ReporterUserID)
	params.ReportedUserID = strings.TrimSpace(params.ReportedUserID)
	params.Category = normalizeReportCategory(params.Category)
	params.Reason = strings.TrimSpace(params.Reason)
	if len(params.Reason) > 1000 {
		params.Reason = params.Reason[:1000]
	}
	if params.MatchID == "" || params.ReporterUserID == "" || params.ReportedUserID == "" {
		return ModerationReportCreated{}, errors.New("matchID, reporter, and reported user are required")
	}
	if params.ReporterUserID == params.ReportedUserID {
		return ModerationReportCreated{}, errors.New("self reports are not allowed")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ModerationReportCreated{}, err
	}
	defer tx.Rollback(ctx)

	var reporterName, reportedName string
	var reporterCreatedAt time.Time
	var reputation reporterReputation
	var mutedUntil *time.Time
	if err := tx.QueryRow(ctx, `
		select
			coalesce(nullif(reporter_user.display_name, ''), $2),
			coalesce(nullif(reported_user.display_name, ''), $3),
			reporter_user.created_at,
			coalesce(rep.reports_confirmed, 0),
			coalesce(rep.reports_dismissed, 0),
			coalesce(rep.reports_inconclusive, 0),
			coalesce(rep.reports_abusive, 0),
			rep.muted_until
		from match_players reporter
		join users reporter_user on reporter_user.id = reporter.user_id
		join match_players reported on reported.match_id = reporter.match_id
		join users reported_user on reported_user.id = reported.user_id
		left join moderation_reporter_reputation rep on rep.user_id = reporter.user_id
		where reporter.match_id = $1
		  and reporter.user_id = $2
		  and reported.user_id = $3
		  and reporter_user.account_type <> 'guest'
	`, params.MatchID, params.ReporterUserID, params.ReportedUserID).Scan(&reporterName, &reportedName, &reporterCreatedAt, &reputation.Confirmed, &reputation.Dismissed, &reputation.Inconclusive, &reputation.Abusive, &mutedUntil); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ModerationReportCreated{}, errors.New("report target not found")
		}
		return ModerationReportCreated{}, err
	}
	volume, err := moderationReporterVolume(ctx, tx, params.ReporterUserID)
	if err != nil {
		return ModerationReportCreated{}, err
	}
	reporterWeight := moderationReporterWeight(reporterCreatedAt, reputation, volume)
	if mutedUntil != nil && mutedUntil.After(time.Now()) {
		reporterWeight = 0
	}
	var caseID int64
	if err := tx.QueryRow(ctx, `
		insert into moderation_cases(target_user_id, target_display_name, status, priority, summary)
		values($1, $2, 'new', 'low', 'Player reported by match opponent.')
		on conflict (target_user_id) where status in ('new', 'triaged', 'reviewing', 'watching')
		do update set
			target_display_name = excluded.target_display_name,
			latest_activity_at = now(),
			updated_at = now()
		returning id
	`, params.ReportedUserID, reportedName).Scan(&caseID); err != nil {
		return ModerationReportCreated{}, err
	}

	var reportID int64
	if err := tx.QueryRow(ctx, `
		insert into moderation_reports(case_id, match_id, reporter_user_id, reported_user_id, category, reason, reporter_weight)
		values($1, $2, $3, $4, $5, nullif($6, ''), $7)
		on conflict (match_id, reporter_user_id, reported_user_id) do nothing
		returning id
	`, caseID, params.MatchID, params.ReporterUserID, params.ReportedUserID, params.Category, params.Reason, reporterWeight).Scan(&reportID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ModerationReportCreated{CaseID: caseID, Status: "duplicate"}, tx.Commit(ctx)
		}
		return ModerationReportCreated{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into moderation_reporter_reputation(user_id, reports_submitted, report_weight, updated_at)
		values($1, 1, $2, now())
		on conflict (user_id) do update set
			reports_submitted = moderation_reporter_reputation.reports_submitted + 1,
			report_weight = excluded.report_weight,
			updated_at = now()
	`, params.ReporterUserID, reporterWeight); err != nil {
		return ModerationReportCreated{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into moderation_case_events(case_id, actor_user_id, event_type, body, metadata)
		values($1, $2, 'report_created', $3, jsonb_build_object('reportId', $4::bigint, 'matchId', $5::text, 'category', $6::text, 'reporterName', $7::text))
	`, caseID, params.ReporterUserID, params.Reason, reportID, params.MatchID, params.Category, reporterName); err != nil {
		return ModerationReportCreated{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ModerationReportCreated{}, err
	}
	return ModerationReportCreated{CaseID: caseID, Status: "created"}, nil
}

func (s *pgStore) CreateDebugModerationReports(params CreateDebugModerationReportsParams) (DebugModerationReportsResult, error) {
	params.ReportedUserID = strings.TrimSpace(params.ReportedUserID)
	params.Category = normalizeReportCategory(params.Category)
	params.Reason = strings.TrimSpace(params.Reason)
	params.CreatedBy = strings.TrimSpace(params.CreatedBy)
	if params.ReportedUserID == "" {
		return DebugModerationReportsResult{}, errors.New("reported user required")
	}
	if params.Count <= 0 {
		params.Count = 3
	}
	if params.Count > 20 {
		params.Count = 20
	}
	if params.Reason == "" {
		params.Reason = "Debug generated report"
	}
	if !strings.HasPrefix(strings.ToLower(params.Reason), "[debug]") {
		params.Reason = "[debug] " + params.Reason
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DebugModerationReportsResult{}, err
	}
	defer tx.Rollback(ctx)

	var reportedName string
	var reportedUserID string
	if err := tx.QueryRow(ctx, `
		select id, coalesce(nullif(display_name, ''), id)
		from users
		where coalesce(account_type, 'registered') <> 'guest'
			and (
				id = $1
				or lower(display_name) = lower($1)
				or lower(coalesce(email, '')) = lower($1)
			)
		order by case when id = $1 then 0 else 1 end, created_at asc
		limit 1
	`, params.ReportedUserID).Scan(&reportedUserID, &reportedName); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DebugModerationReportsResult{}, errors.New("reported user not found")
		}
		return DebugModerationReportsResult{}, err
	}
	params.ReportedUserID = reportedUserID

	rows, err := tx.Query(ctx, `
		select
			u.id,
			coalesce(nullif(u.display_name, ''), u.id),
			u.created_at,
			coalesce(rep.reports_confirmed, 0),
			coalesce(rep.reports_dismissed, 0),
			coalesce(rep.reports_inconclusive, 0),
			coalesce(rep.reports_abusive, 0)
		from users u
		left join moderation_reporter_reputation rep on rep.user_id = u.id
		where u.id <> $1
			and coalesce(u.account_type, 'registered') <> 'guest'
			and coalesce(rep.muted_until, '-infinity'::timestamptz) <= now()
		order by u.created_at asc, u.id asc
		limit $2
	`, params.ReportedUserID, params.Count)
	if err != nil {
		return DebugModerationReportsResult{}, err
	}
	type reporter struct {
		id         string
		name       string
		createdAt  time.Time
		reputation reporterReputation
	}
	reporters := []reporter{}
	for rows.Next() {
		var item reporter
		if err := rows.Scan(&item.id, &item.name, &item.createdAt, &item.reputation.Confirmed, &item.reputation.Dismissed, &item.reputation.Inconclusive, &item.reputation.Abusive); err != nil {
			rows.Close()
			return DebugModerationReportsResult{}, err
		}
		reporters = append(reporters, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return DebugModerationReportsResult{}, err
	}
	rows.Close()
	if len(reporters) == 0 {
		return DebugModerationReportsResult{}, errors.New("no existing registered reporter users available")
	}

	var caseID int64
	if err := tx.QueryRow(ctx, `
		insert into moderation_cases(target_user_id, target_display_name, status, priority, summary)
		values($1, $2, 'new', 'low', 'Debug generated moderation case.')
		on conflict (target_user_id) where status in ('new', 'triaged', 'reviewing', 'watching')
		do update set
			target_display_name = excluded.target_display_name,
			latest_activity_at = now(),
			updated_at = now()
		returning id
	`, params.ReportedUserID, reportedName).Scan(&caseID); err != nil {
		return DebugModerationReportsResult{}, err
	}

	createdReporterIDs := []string{}
	for i, reporter := range reporters {
		matchID := newDebugMatchID(i + 1)
		snapshot := map[string]any{
			"matchId": matchID,
			"mode":    "duel",
			"state":   "ended",
			"debug":   true,
			"players": map[string]any{
				params.ReportedUserID: map[string]any{"userId": params.ReportedUserID, "displayName": reportedName},
				reporter.id:           map[string]any{"userId": reporter.id, "displayName": reporter.name},
			},
		}
		rawSnapshot, err := json.Marshal(snapshot)
		if err != nil {
			return DebugModerationReportsResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			insert into match_history(match_id, mode, state, started_at, ended_at, snapshot_json)
			values($1, 'duel', 'ended', now(), now(), $2::jsonb)
			on conflict (match_id) do nothing
		`, matchID, string(rawSnapshot)); err != nil {
			return DebugModerationReportsResult{}, err
		}
		for _, player := range []struct {
			id   string
			name string
		}{
			{params.ReportedUserID, reportedName},
			{reporter.id, reporter.name},
		} {
			if _, err := tx.Exec(ctx, `
				insert into match_players(match_id, user_id, display_name, mmr, hp)
				values($1, $2, $3, 1500, 0)
				on conflict (match_id, user_id) do nothing
			`, matchID, player.id, player.name); err != nil {
				return DebugModerationReportsResult{}, err
			}
		}
		volume, err := moderationReporterVolume(ctx, tx, reporter.id)
		if err != nil {
			return DebugModerationReportsResult{}, err
		}
		weight := moderationReporterWeight(reporter.createdAt, reporter.reputation, volume)
		var reportID int64
		if err := tx.QueryRow(ctx, `
			insert into moderation_reports(case_id, match_id, reporter_user_id, reported_user_id, category, reason, reporter_weight)
			values($1, $2, $3, $4, $5, nullif($6, ''), $7)
			returning id
		`, caseID, matchID, reporter.id, params.ReportedUserID, params.Category, params.Reason, weight).Scan(&reportID); err != nil {
			return DebugModerationReportsResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			insert into moderation_reporter_reputation(user_id, reports_submitted, report_weight, updated_at)
			values($1, 1, $2, now())
			on conflict (user_id) do update set
				reports_submitted = moderation_reporter_reputation.reports_submitted + 1,
				report_weight = excluded.report_weight,
				updated_at = now()
		`, reporter.id, weight); err != nil {
			return DebugModerationReportsResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			insert into moderation_case_events(case_id, actor_user_id, event_type, body, metadata)
			values($1, nullif($2, ''), 'debug_report_created', $3, jsonb_build_object('reportId', $4::bigint, 'matchId', $5::text, 'reporterUserId', $6::text, 'category', $7::text))
		`, caseID, params.CreatedBy, params.Reason, reportID, matchID, reporter.id, params.Category); err != nil {
			return DebugModerationReportsResult{}, err
		}
		createdReporterIDs = append(createdReporterIDs, reporter.id)
	}

	if _, err := tx.Exec(ctx, `
		insert into moderation_case_events(case_id, actor_user_id, event_type, body, metadata)
		values($1, nullif($2, ''), 'debug_reports_created', $3, jsonb_build_object('count', $4::int))
	`, caseID, params.CreatedBy, params.Reason, len(createdReporterIDs)); err != nil {
		return DebugModerationReportsResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return DebugModerationReportsResult{}, err
	}
	return DebugModerationReportsResult{CaseID: caseID, ReportsCreated: len(createdReporterIDs), ReporterUserIDs: createdReporterIDs}, nil
}

func enqueueNotificationOutbox(ctx context.Context, tx pgx.Tx, notificationType, dedupeKey string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into notification_outbox(type, dedupe_key, payload_json)
		values($1, $2, $3::jsonb)
		on conflict (dedupe_key) do nothing
	`, notificationType, dedupeKey, string(body))
	return err
}

func (s *pgStore) ListModerationCases(status string, limit int) ([]ModerationCaseSummary, error) {
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	status = strings.TrimSpace(status)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	rows, err := s.pool.Query(ctx, `
		select
			id, target_user_id, target_display_name, status, priority, score,
			report_count, unique_reporter_count, categories::text,
			coalesce(summary, ''), coalesce(assigned_to, ''),
			latest_activity_at, created_at, notification_sent_at
		from moderation_cases
		where ($1 = '' or status = $1)
		order by
			case priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
			latest_activity_at desc
		limit $2
	`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ModerationCaseSummary, 0, limit)
	for rows.Next() {
		item, err := scanModerationCaseSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *pgStore) GetModerationCase(caseID int64) (ModerationCaseDetail, error) {
	if caseID <= 0 {
		return ModerationCaseDetail{}, errors.New("caseID required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		select
			id, target_user_id, target_display_name, status, priority, score,
			report_count, unique_reporter_count, categories::text,
			coalesce(summary, ''), coalesce(assigned_to, ''),
			latest_activity_at, created_at, notification_sent_at
		from moderation_cases
		where id = $1
	`, caseID)
	var detail ModerationCaseDetail
	var err error
	detail.Case, err = scanModerationCaseSummary(row)
	if err != nil {
		return ModerationCaseDetail{}, err
	}
	targetPlayer, err := s.getAdminPlayerSummary(ctx, detail.Case.TargetUserID)
	if err != nil {
		return ModerationCaseDetail{}, err
	}
	detail.TargetPlayer = &targetPlayer
	reports, err := s.listModerationCaseReports(ctx, caseID)
	if err != nil {
		return ModerationCaseDetail{}, err
	}
	events, err := s.listModerationCaseEvents(ctx, caseID)
	if err != nil {
		return ModerationCaseDetail{}, err
	}
	actions, err := s.listModerationCaseActions(ctx, caseID)
	if err != nil {
		return ModerationCaseDetail{}, err
	}
	detail.Reports = reports
	detail.Events = events
	detail.Actions = actions
	return detail, nil
}

func (s *pgStore) AddModerationCaseAction(params ModerationCaseActionParams) (ModerationCaseDetail, error) {
	params.ActionType = strings.TrimSpace(params.ActionType)
	params.Status = strings.TrimSpace(params.Status)
	params.ActorUserID = strings.TrimSpace(params.ActorUserID)
	params.Reason = strings.TrimSpace(params.Reason)
	if params.CaseID <= 0 || params.ActionType == "" {
		return ModerationCaseDetail{}, errors.New("caseID and action type required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ModerationCaseDetail{}, err
	}
	defer tx.Rollback(ctx)
	var targetUserID, currentStatus string
	if err := tx.QueryRow(ctx, `select target_user_id, status from moderation_cases where id = $1`, params.CaseID).Scan(&targetUserID, &currentStatus); err != nil {
		return ModerationCaseDetail{}, err
	}
	applyReputation := currentStatus != "actioned" && currentStatus != "dismissed" && currentStatus != "duplicate"
	if params.ActionType == "status" || params.ActionType == "dismiss" {
		status := params.Status
		if status == "" && params.ActionType == "dismiss" {
			status = "dismissed"
		}
		if status == "" {
			return ModerationCaseDetail{}, errors.New("status required")
		}
		_, err = tx.Exec(ctx, `
			update moderation_cases
			set status = $2,
				resolved_at = case when $2 in ('actioned', 'dismissed', 'duplicate') then now() else resolved_at end,
				resolved_by = case when $2 in ('actioned', 'dismissed', 'duplicate') then nullif($3, '') else resolved_by end,
				resolution = nullif($4, ''),
				updated_at = now(),
				latest_activity_at = now()
			where id = $1
		`, params.CaseID, status, params.ActorUserID, params.Reason)
		if err != nil {
			return ModerationCaseDetail{}, err
		}
		switch status {
		case "actioned":
			if applyReputation {
				if err := updateReporterReputationForCase(ctx, tx, params.CaseID, "confirmed"); err != nil {
					return ModerationCaseDetail{}, err
				}
			}
		case "dismissed":
			if applyReputation {
				if err := updateReporterReputationForCase(ctx, tx, params.CaseID, "dismissed"); err != nil {
					return ModerationCaseDetail{}, err
				}
			}
		}
	}
	if params.ActionType == "mark_inconclusive" {
		if applyReputation {
			if err := updateReporterReputationForCase(ctx, tx, params.CaseID, "inconclusive"); err != nil {
				return ModerationCaseDetail{}, err
			}
		}
		_, err = tx.Exec(ctx, `
			update moderation_cases
			set status = 'dismissed',
				resolved_at = now(),
				resolved_by = nullif($2, ''),
				resolution = nullif($3, ''),
				updated_at = now(),
				latest_activity_at = now()
			where id = $1
		`, params.CaseID, params.ActorUserID, params.Reason)
		if err != nil {
			return ModerationCaseDetail{}, err
		}
	}
	if params.ActionType == "abusive_reports" {
		if applyReputation {
			if err := updateReporterReputationForCase(ctx, tx, params.CaseID, "abusive"); err != nil {
				return ModerationCaseDetail{}, err
			}
		}
		_, err = tx.Exec(ctx, `
			update moderation_cases
			set status = 'dismissed',
				resolved_at = now(),
				resolved_by = nullif($2, ''),
				resolution = nullif($3, ''),
				updated_at = now(),
				latest_activity_at = now()
			where id = $1
		`, params.CaseID, params.ActorUserID, params.Reason)
		if err != nil {
			return ModerationCaseDetail{}, err
		}
		if applyReputation {
			if _, err := tx.Exec(ctx, `
			update moderation_reporter_reputation rep
			set muted_until = greatest(coalesce(muted_until, now()), now() + interval '7 days'),
				updated_at = now()
			from (
				select distinct reporter_user_id
				from moderation_reports
				where case_id = $1
			) reporters
			where rep.user_id = reporters.reporter_user_id
		`, params.CaseID); err != nil {
				return ModerationCaseDetail{}, err
			}
		}
	}
	if params.ActionType == "assign" {
		_, err = tx.Exec(ctx, `
			update moderation_cases
			set assigned_to = nullif($2, ''), status = 'reviewing', updated_at = now(), latest_activity_at = now()
			where id = $1
		`, params.CaseID, params.AssignedTo)
		if err != nil {
			return ModerationCaseDetail{}, err
		}
	}
	if params.ActionType == "report_mute" {
		muteUserID := strings.TrimSpace(params.MuteUserID)
		if muteUserID == "" {
			muteUserID = targetUserID
		}
		if params.MuteUntil.IsZero() {
			params.MuteUntil = time.Now().Add(7 * 24 * time.Hour)
		}
		if _, err := tx.Exec(ctx, `
			insert into moderation_reporter_reputation(user_id, muted_until, report_weight, updated_at)
			values($1, $2, 0, now())
			on conflict (user_id) do update set
				muted_until = excluded.muted_until,
				report_weight = 0,
				updated_at = now()
		`, muteUserID, params.MuteUntil); err != nil {
			return ModerationCaseDetail{}, err
		}
	}
	if _, err := tx.Exec(ctx, `
		insert into moderation_actions(case_id, actor_user_id, target_user_id, action_type, reason)
		values($1, nullif($2, ''), $3, $4, nullif($5, ''))
	`, params.CaseID, params.ActorUserID, targetUserID, params.ActionType, params.Reason); err != nil {
		return ModerationCaseDetail{}, err
	}
	if _, err := tx.Exec(ctx, `
		insert into moderation_case_events(case_id, actor_user_id, event_type, body)
		values($1, nullif($2, ''), $3, nullif($4, ''))
	`, params.CaseID, params.ActorUserID, "action_"+params.ActionType, params.Reason); err != nil {
		return ModerationCaseDetail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ModerationCaseDetail{}, err
	}
	return s.GetModerationCase(params.CaseID)
}

func (s *pgStore) RecomputeModerationProjections(limit int) (int, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Release()
	var locked bool
	if err := conn.QueryRow(ctx, `select pg_try_advisory_lock($1)`, moderationProjectionAdvisoryKey).Scan(&locked); err != nil {
		return 0, err
	}
	if !locked {
		return 0, nil
	}
	defer func() {
		_, _ = conn.Exec(context.Background(), `select pg_advisory_unlock($1)`, moderationProjectionAdvisoryKey)
	}()
	rows, err := s.pool.Query(ctx, `
		select id
		from moderation_cases
		where status in ('new', 'triaged', 'reviewing', 'watching')
		order by latest_activity_at desc, id asc
		limit $1
	`, limit)
	if err != nil {
		return 0, err
	}
	caseIDs := []int64{}
	for rows.Next() {
		var caseID int64
		if err := rows.Scan(&caseID); err != nil {
			rows.Close()
			return 0, err
		}
		caseIDs = append(caseIDs, caseID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	recomputed := 0
	for _, caseID := range caseIDs {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return recomputed, err
		}
		summary, notify, err := refreshModerationCaseSummary(ctx, tx, caseID)
		if err == nil && notify {
			payload := ModerationCaseNotificationPayload{
				CaseID:              summary.ID,
				TargetUserID:        summary.TargetUserID,
				TargetDisplayName:   summary.TargetDisplayName,
				Priority:            summary.Priority,
				Score:               summary.Score,
				ReportCount:         summary.ReportCount,
				UniqueReporterCount: summary.UniqueReporterCount,
				Categories:          summary.Categories,
				LatestActivityAt:    summary.LatestActivityAt,
			}
			err = enqueueNotificationOutbox(ctx, tx, "moderation_case_threshold", fmt.Sprintf("moderation_case:%d:threshold", caseID), payload)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			return recomputed, err
		}
		if err := tx.Commit(ctx); err != nil {
			return recomputed, err
		}
		recomputed++
	}
	return recomputed, nil
}

func (s *pgStore) listModerationCaseReports(ctx context.Context, caseID int64) ([]ModerationReportSummary, error) {
	rows, err := s.pool.Query(ctx, `
		select
			r.id, r.case_id, r.match_id, r.reporter_user_id,
			coalesce(nullif(reporter.display_name, ''), r.reporter_user_id),
			r.reported_user_id,
			coalesce(nullif(reported.display_name, ''), r.reported_user_id),
			r.category, coalesce(r.reason, ''), r.reporter_weight, r.created_at
		from moderation_reports r
		left join users reporter on reporter.id = r.reporter_user_id
		left join users reported on reported.id = r.reported_user_id
		where r.case_id = $1
		order by r.created_at desc
	`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ModerationReportSummary, 0)
	for rows.Next() {
		var item ModerationReportSummary
		if err := rows.Scan(&item.ID, &item.CaseID, &item.MatchID, &item.ReporterUserID, &item.ReporterName, &item.ReportedUserID, &item.ReportedName, &item.Category, &item.Reason, &item.ReporterWeight, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *pgStore) listModerationCaseEvents(ctx context.Context, caseID int64) ([]ModerationCaseEvent, error) {
	rows, err := s.pool.Query(ctx, `
		select id, case_id, coalesce(actor_user_id, ''), event_type, coalesce(body, ''), created_at
		from moderation_case_events
		where case_id = $1
		order by created_at desc
	`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ModerationCaseEvent{}
	for rows.Next() {
		var item ModerationCaseEvent
		if err := rows.Scan(&item.ID, &item.CaseID, &item.ActorUserID, &item.EventType, &item.Body, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *pgStore) listModerationCaseActions(ctx context.Context, caseID int64) ([]ModerationActionSummary, error) {
	rows, err := s.pool.Query(ctx, `
		select id, case_id, coalesce(actor_user_id, ''), target_user_id, action_type, coalesce(reason, ''), created_at
		from moderation_actions
		where case_id = $1
		order by created_at desc
	`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ModerationActionSummary{}
	for rows.Next() {
		var item ModerationActionSummary
		if err := rows.Scan(&item.ID, &item.CaseID, &item.ActorUserID, &item.TargetUserID, &item.ActionType, &item.Reason, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

type moderationCaseScanner interface {
	Scan(dest ...any) error
}

func scanModerationCaseSummary(row moderationCaseScanner) (ModerationCaseSummary, error) {
	var item ModerationCaseSummary
	var categoriesRaw string
	var notificationSentAt *time.Time
	if err := row.Scan(&item.ID, &item.TargetUserID, &item.TargetDisplayName, &item.Status, &item.Priority, &item.Score, &item.ReportCount, &item.UniqueReporterCount, &categoriesRaw, &item.Summary, &item.AssignedTo, &item.LatestActivityAt, &item.CreatedAt, &notificationSentAt); err != nil {
		return ModerationCaseSummary{}, err
	}
	if err := json.Unmarshal([]byte(categoriesRaw), &item.Categories); err != nil {
		item.Categories = map[string]int{}
	}
	if item.Categories == nil {
		item.Categories = map[string]int{}
	}
	if notificationSentAt != nil {
		item.NotificationSentAt = *notificationSentAt
	}
	return item, nil
}

func normalizeReportCategory(category string) string {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "cheating", "profile", "harassment", "boosting", "other":
		return strings.ToLower(strings.TrimSpace(category))
	default:
		return "cheating"
	}
}

type reporterReputation struct {
	Confirmed    int
	Dismissed    int
	Inconclusive int
	Abusive      int
}

type reporterVolume struct {
	Last24h int
	Last7d  int
}

func moderationReporterWeight(createdAt time.Time, reputation reporterReputation, volume reporterVolume) float64 {
	age := time.Since(createdAt)
	weight := 1.0
	if age < 24*time.Hour {
		weight = 0.25
	} else if age < 7*24*time.Hour {
		weight = 0.5
	}
	weight *= reporterReputationMultiplier(reputation)
	weight *= reporterVolumeMultiplier(volume)
	if weight < 0.05 {
		return 0.05
	}
	if weight > 1.5 {
		return 1.5
	}
	return weight
}

func reporterReputationMultiplier(reputation reporterReputation) float64 {
	if reputation.Abusive >= 3 {
		return 0.1
	}
	if reputation.Abusive > 0 {
		return 0.25
	}
	reviewed := reputation.Confirmed + reputation.Dismissed
	if reviewed < 5 {
		return 1
	}
	accuracy := float64(reputation.Confirmed) / float64(reviewed)
	switch {
	case reputation.Confirmed >= 10 && accuracy >= 0.85:
		return 1.25
	case accuracy >= 0.65:
		return 1
	case accuracy >= 0.4:
		return 0.5
	default:
		return 0.15
	}
}

func reporterVolumeMultiplier(volume reporterVolume) float64 {
	daily := smoothReportVolumeDecay(float64(volume.Last24h), 6, 1.4)
	weeklyAverage := float64(volume.Last7d) / 7
	weekly := smoothReportVolumeDecay(weeklyAverage, 6, 1.4)
	if daily < weekly {
		return daily
	}
	return weekly
}

func smoothReportVolumeDecay(count, softLimit, power float64) float64 {
	if count <= 0 || softLimit <= 0 || power <= 0 {
		return 1
	}
	return 1 / (1 + math.Pow(count/softLimit, power))
}

func moderationReporterVolume(ctx context.Context, tx pgx.Tx, reporterUserID string) (reporterVolume, error) {
	var volume reporterVolume
	err := tx.QueryRow(ctx, `
		select
			count(*) filter (where created_at >= now() - interval '24 hours')::int,
			count(*) filter (where created_at >= now() - interval '7 days')::int
		from moderation_reports
		where reporter_user_id = $1
	`, reporterUserID).Scan(&volume.Last24h, &volume.Last7d)
	return volume, err
}

func moderationReporterWeightSQL() string {
	return `
		least(1.5, greatest(0.05,
			case
				when u.created_at > now() - interval '24 hours' then 0.25
				when u.created_at > now() - interval '7 days' then 0.5
				else 1.0
			end *
			case
				when rep.reports_abusive >= 3 then 0.1
				when rep.reports_abusive > 0 then 0.25
				when (rep.reports_confirmed + rep.reports_dismissed) < 5 then 1.0
				when rep.reports_confirmed >= 10 and (rep.reports_confirmed::double precision / greatest(1, rep.reports_confirmed + rep.reports_dismissed)) >= 0.85 then 1.25
				when (rep.reports_confirmed::double precision / greatest(1, rep.reports_confirmed + rep.reports_dismissed)) >= 0.65 then 1.0
				when (rep.reports_confirmed::double precision / greatest(1, rep.reports_confirmed + rep.reports_dismissed)) >= 0.4 then 0.5
				else 0.15
			end
		))
	`
}

func updateReporterReputationForCase(ctx context.Context, tx pgx.Tx, caseID int64, outcome string) error {
	column := ""
	switch outcome {
	case "confirmed":
		column = "reports_confirmed"
	case "dismissed":
		column = "reports_dismissed"
	case "inconclusive":
		column = "reports_inconclusive"
	case "abusive":
		column = "reports_abusive"
	default:
		return errors.New("unknown reporter reputation outcome")
	}
	query := fmt.Sprintf(`
		insert into moderation_reporter_reputation(user_id, %s, updated_at)
		select reporter_user_id, count(*)::int, now()
		from moderation_reports
		where case_id = $1
		group by reporter_user_id
		on conflict (user_id) do update set
			%s = moderation_reporter_reputation.%s + excluded.%s,
			updated_at = now()
	`, column, column, column, column)
	if _, err := tx.Exec(ctx, query, caseID); err != nil {
		return err
	}
	reweight := fmt.Sprintf(`
		update moderation_reporter_reputation rep
		set report_weight = %s,
			updated_at = now()
		from users u
		where u.id = rep.user_id
			and rep.user_id in (
				select distinct reporter_user_id
				from moderation_reports
				where case_id = $1
			)
	`, moderationReporterWeightSQL())
	_, err := tx.Exec(ctx, reweight, caseID)
	return err
}

func moderationPriority(score float64, uniqueReporters int) string {
	if score >= 6 || uniqueReporters >= 6 {
		return "urgent"
	}
	if score >= 3 || uniqueReporters >= 3 {
		return "high"
	}
	if score >= 1.5 || uniqueReporters >= 2 {
		return "medium"
	}
	return "low"
}

func refreshModerationCaseSummary(ctx context.Context, tx pgx.Tx, caseID int64) (ModerationCaseSummary, bool, error) {
	var score float64
	var reportCount, uniqueReporterCount int
	var categoriesRaw string
	var notificationSentAt *time.Time
	if err := tx.QueryRow(ctx, `
		with category_counts as (
			select coalesce(jsonb_object_agg(category, count), '{}'::jsonb) as categories
			from (
				select category, count(*)::int as count
				from moderation_reports
				where case_id = $1
				group by category
			) c
		)
		select
			coalesce(sum(reporter_weight), 0),
			count(*)::int,
			count(distinct reporter_user_id)::int,
			coalesce((select categories from category_counts), '{}'::jsonb)::text
		from moderation_reports
		where case_id = $1
	`, caseID).Scan(&score, &reportCount, &uniqueReporterCount, &categoriesRaw); err != nil {
		return ModerationCaseSummary{}, false, err
	}
	priority := moderationPriority(score, uniqueReporterCount)
	if err := tx.QueryRow(ctx, `select notification_sent_at from moderation_cases where id = $1`, caseID).Scan(&notificationSentAt); err != nil {
		return ModerationCaseSummary{}, false, err
	}
	shouldNotify := (priority == "high" || priority == "urgent") && notificationSentAt == nil
	row := tx.QueryRow(ctx, `
		update moderation_cases
		set score = $2,
			report_count = $3,
			unique_reporter_count = $4,
			categories = $5::jsonb,
			priority = $6,
			notification_sent_at = case when $7 then now() else notification_sent_at end,
			latest_activity_at = now(),
			updated_at = now()
		where id = $1
		returning
			id, target_user_id, target_display_name, status, priority, score,
			report_count, unique_reporter_count, categories::text,
			coalesce(summary, ''), coalesce(assigned_to, ''),
			latest_activity_at, created_at, notification_sent_at
	`, caseID, score, reportCount, uniqueReporterCount, categoriesRaw, priority, shouldNotify)
	summary, err := scanModerationCaseSummary(row)
	if err != nil {
		return ModerationCaseSummary{}, false, err
	}
	return summary, shouldNotify, nil
}

func (s *pgStore) ClaimPendingNotification(notificationType string, now time.Time) (NotificationOutboxItem, bool, error) {
	notificationType = strings.TrimSpace(notificationType)
	if notificationType == "" {
		return NotificationOutboxItem{}, false, errors.New("notification type required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return NotificationOutboxItem{}, false, err
	}
	defer tx.Rollback(ctx)
	row := tx.QueryRow(ctx, `
		with candidate as (
			select id
			from notification_outbox
			where type = $1
				and sent_at is null
				and next_attempt_at <= $2
			order by next_attempt_at asc, id asc
			limit 1
			for update skip locked
		)
		update notification_outbox n
		set attempts = n.attempts + 1,
			next_attempt_at = $3,
			last_error = null
		from candidate
		where n.id = candidate.id
		returning n.id, n.type, n.payload_json::text, n.attempts
	`, notificationType, now, now.Add(5*time.Minute))
	var item NotificationOutboxItem
	var raw string
	if err := row.Scan(&item.ID, &item.Type, &raw, &item.Attempts); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return NotificationOutboxItem{}, false, nil
		}
		return NotificationOutboxItem{}, false, err
	}
	item.PayloadJSON = []byte(raw)
	if err := tx.Commit(ctx); err != nil {
		return NotificationOutboxItem{}, false, err
	}
	return item, true, nil
}

func (s *pgStore) MarkNotificationSent(id int64) error {
	if id <= 0 {
		return errors.New("notification id required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update notification_outbox
		set sent_at = now(),
			last_error = null
		where id = $1
	`, id)
	return err
}

func (s *pgStore) MarkNotificationFailed(id int64, nextAttemptAt time.Time, lastError string) error {
	if id <= 0 {
		return errors.New("notification id required")
	}
	lastError = strings.TrimSpace(lastError)
	if len(lastError) > 1000 {
		lastError = lastError[:1000]
	}
	if nextAttemptAt.IsZero() {
		nextAttemptAt = time.Now().Add(time.Minute)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update notification_outbox
		set next_attempt_at = $2,
			last_error = nullif($3, '')
		where id = $1
			and sent_at is null
	`, id, nextAttemptAt, lastError)
	return err
}

func (s *pgStore) IssueEloRefundsForCheater(userID string, lookback time.Duration) (EloRefundSummary, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return EloRefundSummary{}, errors.New("userID required")
	}
	if lookback <= 0 {
		lookback = 24 * time.Hour
	}
	since := time.Now().Add(-lookback)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EloRefundSummary{}, err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()
	rows, err := tx.Query(ctx, `
		with candidate_matches as (
			select
				h.match_id,
				h.winner_user_id,
				h.snapshot_json,
				opponent.user_id as opponent_user_id
			from match_history h
			join match_players cheater on cheater.match_id = h.match_id and cheater.user_id = $1
			join match_players opponent on opponent.match_id = h.match_id and opponent.user_id <> $1
			left join lobbies l on l.active_match_id = h.match_id
				or l.started_match_id = h.match_id
				or l.last_match_id = h.match_id
			where h.mode = $2
				and h.ended_at >= $3
				and coalesce((h.snapshot_json->>'unranked')::boolean, false) = false
				and l.id is null
		)
		select
			match_id,
			opponent_user_id,
			case
				when winner_user_id = opponent_user_id then (snapshot_json->'ratingPreview'->opponent_user_id->>'win')::int
				when winner_user_id = $1 then (snapshot_json->'ratingPreview'->opponent_user_id->>'lose')::int
				else (snapshot_json->'ratingPreview'->opponent_user_id->>'draw')::int
			end as original_delta
		from candidate_matches
		where snapshot_json->'ratingPreview' ? opponent_user_id
		order by match_id
	`, userID, modeDuel, since)
	if err != nil {
		return EloRefundSummary{}, err
	}
	defer rows.Close()

	type refundCandidate struct {
		matchID       string
		opponentID    string
		originalDelta int
	}
	candidates := []refundCandidate{}
	for rows.Next() {
		var item refundCandidate
		if err := rows.Scan(&item.matchID, &item.opponentID, &item.originalDelta); err != nil {
			return EloRefundSummary{}, err
		}
		if item.originalDelta < 0 {
			candidates = append(candidates, item)
		}
	}
	if err := rows.Err(); err != nil {
		return EloRefundSummary{}, err
	}
	rows.Close()

	var summary EloRefundSummary
	for _, item := range candidates {
		refundDelta := -item.originalDelta
		tag, err := tx.Exec(ctx, `
			insert into elo_refunds(user_id, match_id, cheater_user_id, original_delta, refund_delta, reason)
			values($1, $2, $3, $4, $5, 'cheating_verdict')
			on conflict (user_id, match_id, cheater_user_id) do nothing
		`, item.opponentID, item.matchID, userID, item.originalDelta, refundDelta)
		if err != nil {
			return EloRefundSummary{}, err
		}
		if tag.RowsAffected() == 0 {
			continue
		}
		updateTag, err := tx.Exec(ctx, `
			update ranks
			set mmr = mmr + $4,
				updated_at = now()
			where user_id = $1
				and mode = $2
				and season_id = $3
		`, item.opponentID, modeDuel, defaultSeasonID, refundDelta)
		if err != nil {
			return EloRefundSummary{}, err
		}
		if updateTag.RowsAffected() == 0 {
			return EloRefundSummary{}, fmt.Errorf("rank row missing for refund user %s", item.opponentID)
		}
		summary.RefundsIssued++
		summary.TotalRefunded += refundDelta
	}
	if err := tx.Commit(ctx); err != nil {
		return EloRefundSummary{}, err
	}
	return summary, nil
}

func (s *pgStore) AddSignupIPBan(ipAddress, reason, createdBy string) error {
	ipAddress = strings.TrimSpace(ipAddress)
	if ipAddress == "" {
		return errors.New("ip address required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		insert into ip_signup_bans(ip_address, reason, created_by, created_at, revoked_at)
		values($1, nullif($2, ''), nullif($3, ''), now(), null)
		on conflict (ip_address) do update set
			reason = excluded.reason,
			created_by = excluded.created_by,
			created_at = now(),
			revoked_at = null
	`, ipAddress, strings.TrimSpace(reason), strings.TrimSpace(createdBy))
	return err
}

func (s *pgStore) RemoveSignupIPBan(ipAddress string) error {
	ipAddress = strings.TrimSpace(ipAddress)
	if ipAddress == "" {
		return errors.New("ip address required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update ip_signup_bans
		set revoked_at = coalesce(revoked_at, now())
		where ip_address = $1
	`, ipAddress)
	return err
}

func (s *pgStore) ListSignupIPBans(limit int) ([]SignupIPBan, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	rows, err := s.pool.Query(ctx, `
		select id, ip_address, coalesce(reason, ''), coalesce(created_by, ''), created_at
		from ip_signup_bans
		where revoked_at is null
		order by created_at desc
		limit $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]SignupIPBan, 0, limit)
	for rows.Next() {
		var item SignupIPBan
		if err := rows.Scan(&item.ID, &item.IPAddress, &item.Reason, &item.CreatedBy, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *pgStore) IsSignupIPBanned(ipAddress string) (bool, error) {
	ipAddress = strings.TrimSpace(ipAddress)
	if ipAddress == "" {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(
			select 1 from ip_signup_bans
			where ip_address = $1 and revoked_at is null
		)
	`, ipAddress).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (s *pgStore) GetRuntimeMatch(matchID string) (RuntimeMatch, bool, error) {
	if matchID == "" {
		return RuntimeMatch{}, false, errors.New("matchID required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	row := s.pool.QueryRow(ctx, `
		select
			id,
			state,
			owner_epoch,
			started_at,
			coalesce(ended_at, '0001-01-01 00:00:00+00'::timestamptz)
		from runtime_matches
		where id = $1
	`, matchID)
	var out RuntimeMatch
	if err := row.Scan(&out.MatchID, &out.State, &out.OwnerEpoch, &out.StartedAt, &out.EndedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RuntimeMatch{}, false, nil
		}
		return RuntimeMatch{}, false, err
	}
	return out, true, nil
}

func (s *pgStore) RecordRuntimeMatch(matchID, state string, ownerEpoch int64, terminal bool) error {
	if matchID == "" {
		return errors.New("matchID required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if terminal {
		_, err := s.pool.Exec(ctx, `
			insert into runtime_matches(id, state, owner_epoch, started_at, ended_at)
			values($1,$2,$3,now(),now())
			on conflict (id) do update set
				state = excluded.state,
				owner_epoch = excluded.owner_epoch,
				ended_at = now()
		`, matchID, state, ownerEpoch)
		return err
	}
	_, err := s.pool.Exec(ctx, `
		insert into runtime_matches(id, state, owner_epoch, started_at)
		values($1,$2,$3,now())
		on conflict (id) do update set
			state = excluded.state,
			owner_epoch = excluded.owner_epoch
	`, matchID, state, ownerEpoch)
	return err
}

func (s *pgStore) ExpireStaleRuntimeMatches(prefix string, olderThan time.Duration) error {
	if strings.TrimSpace(prefix) == "" || olderThan <= 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := s.pool.Exec(ctx, `
		update runtime_matches
		set state = $1,
			ended_at = now()
		where state = $2
		  and id like $3
		  and started_at < now() - $4::interval
		  and ended_at is null
	`, string(contracts.MatchEnded), string(contracts.MatchLive), prefix+"%", olderThan.String())
	return err
}

type mapRow struct {
	Lat     float64
	Lng     float64
	Country string
	PanoID  *string
	Heading *float64
	Pitch   *float64
	RandKey float64
}

func parseMapRows(b []byte) ([]mapRow, error) {
	var raw []map[string]any
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, err
	}
	out := make([]mapRow, 0, len(raw))
	for _, it := range raw {
		lat, ok1 := asFloat(it["lat"])
		lng, ok2 := asFloat(it["lng"])
		if !ok1 || !ok2 {
			continue
		}
		if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
			continue
		}
		row := mapRow{Lat: lat, Lng: lng, RandKey: stableRand(lat, lng)}
		if country, ok := it["country"].(string); ok {
			row.Country = country
		}
		if panoID, ok := it["panoId"].(string); ok && panoID != "" {
			row.PanoID = &panoID
		}
		if heading, ok := asFloat(it["heading"]); ok {
			row.Heading = &heading
		}
		if pitch, ok := asFloat(it["pitch"]); ok {
			row.Pitch = &pitch
		}
		out = append(out, row)
	}
	return out, nil
}

func stableRand(lat, lng float64) float64 {
	h := sha1.Sum([]byte(fmt.Sprintf("%.8f:%.8f", lat, lng)))
	v := int(h[0])<<16 | int(h[1])<<8 | int(h[2])
	return float64(v) / float64(1<<24)
}

func asFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	default:
		return 0, false
	}
}

func nullable(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func newUserID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "u_" + hex.EncodeToString(b)
}

func newDebugMatchID(index int) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("debug-report-%s-%02d", hex.EncodeToString(b), index)
}

func normalizeDBURLForContainer(dsn string) string {
	if _, err := os.Stat("/.dockerenv"); err != nil {
		return dsn
	}
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	if u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" {
		port := u.Port()
		if port == "" {
			port = "5432"
		}
		u.Host = "host.docker.internal:" + port
		return u.String()
	}
	return dsn
}
