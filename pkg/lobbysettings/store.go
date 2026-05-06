package lobbysettings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"geoduels/pkg/contracts"
)

const DefaultTTL = 2 * time.Hour

type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

func New(rdb *redis.Client, ttl time.Duration) *Store {
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	return &Store{rdb: rdb, ttl: ttl}
}

func DefaultConfig() contracts.MatchConfig {
	return contracts.NormalizeMatchConfig(contracts.MatchConfig{
		Ruleset:        contracts.RulesetMoving,
		RoundTimerMode: contracts.RoundTimerPressure,
	})
}

func NormalizeConfig(cfg contracts.MatchConfig) contracts.MatchConfig {
	return contracts.NormalizeMatchConfig(cfg)
}

func (s *Store) Get(ctx context.Context, lobbyID string) (contracts.MatchConfig, error) {
	if s == nil || s.rdb == nil || strings.TrimSpace(lobbyID) == "" {
		return DefaultConfig(), nil
	}
	b, err := s.rdb.Get(ctx, key(lobbyID)).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return DefaultConfig(), nil
		}
		return DefaultConfig(), err
	}
	var cfg contracts.MatchConfig
	if err := json.Unmarshal(b, &cfg); err != nil {
		return DefaultConfig(), err
	}
	return NormalizeConfig(cfg), nil
}

func (s *Store) Save(ctx context.Context, lobbyID string, cfg contracts.MatchConfig) (contracts.MatchConfig, error) {
	if s == nil || s.rdb == nil || strings.TrimSpace(lobbyID) == "" {
		return NormalizeConfig(cfg), nil
	}
	normalized := NormalizeConfig(cfg)
	b, _ := json.Marshal(normalized)
	return normalized, s.rdb.Set(ctx, key(lobbyID), b, s.ttl).Err()
}

func (s *Store) Apply(ctx context.Context, snap contracts.LobbySnapshot) contracts.LobbySnapshot {
	cfg, err := s.Get(ctx, snap.ID)
	if err != nil {
		cfg = DefaultConfig()
	}
	snap.Config = cfg
	return snap
}

func key(lobbyID string) string {
	return "lobby:" + strings.TrimSpace(lobbyID) + ":settings"
}
