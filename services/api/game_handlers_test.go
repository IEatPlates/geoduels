package main

import (
	"encoding/json"
	"testing"

	"geoduels/pkg/contracts"
	"geoduels/pkg/persistence"
)

type matchAccessTestStore struct {
	persistence.Store
	identity persistence.Identity
	snapshot []byte
}

func (s *matchAccessTestStore) GetFinalMatchSnapshot(matchID string) ([]byte, bool, error) {
	if matchID != "match-1" || len(s.snapshot) == 0 {
		return nil, false, nil
	}
	return s.snapshot, true, nil
}

func (s *matchAccessTestStore) GetIdentity(sub string) (persistence.Identity, error) {
	return s.identity, nil
}

func TestFinalMatchSnapshotAccessAllowsModerators(t *testing.T) {
	raw, err := json.Marshal(contracts.MatchSnapshot{
		MatchID: "match-1",
		State:   contracts.MatchEnded,
		Players: map[string]contracts.PlayerState{
			"player-1": {UserID: "player-1"},
			"player-2": {UserID: "player-2"},
		},
	})
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}

	tests := []struct {
		name     string
		userID   string
		identity persistence.Identity
		allowed  bool
	}{
		{
			name:    "participant",
			userID:  "player-1",
			allowed: true,
		},
		{
			name:     "admin",
			userID:   "admin-1",
			identity: persistence.Identity{Sub: "admin-1", IsAdmin: true},
			allowed:  true,
		},
		{
			name:     "moderator",
			userID:   "moderator-1",
			identity: persistence.Identity{Sub: "moderator-1", IsModerator: true},
			allowed:  true,
		},
		{
			name:     "stranger",
			userID:   "stranger-1",
			identity: persistence.Identity{Sub: "stranger-1"},
			allowed:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := &api{store: &matchAccessTestStore{identity: tt.identity, snapshot: raw}}
			snapshot, found, allowed, err := a.getFinalMatchSnapshotForUser("match-1", tt.userID)
			if err != nil {
				t.Fatalf("get snapshot: %v", err)
			}
			if !found || snapshot == nil {
				t.Fatal("expected snapshot to be found")
			}
			if allowed != tt.allowed {
				t.Fatalf("allowed = %v, want %v", allowed, tt.allowed)
			}
		})
	}
}
