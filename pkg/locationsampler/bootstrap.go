package locationsampler

import (
	"context"
	"fmt"
)

func NewFromEnv(ctx context.Context, cfg Config) (*Sampler, func(), error) {
	return NewFromEnvForMapKey(ctx, "", cfg)
}

func NewFromEnvForMapKey(ctx context.Context, mapKey string, cfg Config) (*Sampler, func(), error) {
	db, err := NewDBStoreFromEnvForMapKey(mapKey)
	if err != nil {
		return nil, nil, err
	}
	if cfg.MatchTTL <= 0 {
		cfg.MatchTTL = defaultMatchTTL
	}
	store := NewRedisStateStoreFromEnv(cfg.MatchTTL)
	s := New(db, store, cfg)
	if err := s.Init(ctx); err != nil {
		db.Close()
		return nil, nil, fmt.Errorf("locationsampler init failed: %w", err)
	}
	cleanup := func() { db.Close() }
	return s, cleanup, nil
}
