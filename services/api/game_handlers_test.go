package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"

	"geoduels/pkg/auth"
	"geoduels/pkg/contracts"
	"geoduels/pkg/coordinator"
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

func (s *matchAccessTestStore) GetRuntimeMatch(matchID string) (persistence.RuntimeMatch, bool, error) {
	return persistence.RuntimeMatch{}, false, nil
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

func TestMatchSessionAllowsGuestAssignedToLiveMatch(t *testing.T) {
	const matchID = "match-1"
	appSecret := []byte("01234567890123456789012345678901")
	ticketSecret := []byte("abcdefghijklmnopqrstuvwxyz012345")

	gameplay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead && r.URL.Path == "/internal/matches/"+matchID {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer gameplay.Close()

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()
	coordStore := coordinator.NewStore(rdb, time.Minute, time.Hour, time.Hour, time.Second)
	if err := coordStore.RegisterNode(t.Context(), coordinator.NodeRecord{
		NodeID:      "node-1",
		PublicRoute: "node-1",
		InternalURL: gameplay.URL,
	}); err != nil {
		t.Fatalf("register node: %v", err)
	}
	if err := coordStore.SaveAssignment(t.Context(), coordinator.Assignment{
		MatchID:     matchID,
		Mode:        contracts.ModeDuel,
		NodeID:      "node-1",
		PublicRoute: "node-1",
		Players:     []string{"guest-1", "guest-2"},
	}); err != nil {
		t.Fatalf("save assignment: %v", err)
	}

	token, err := auth.IssueAppAccessToken(appSecret, "guest-2", "session-1", time.Minute)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	a := &api{
		store:          &matchAccessTestStore{identity: persistence.Identity{Sub: "guest-2", AccountType: "guest"}},
		coord:          coordStore,
		appAuthSecret:  appSecret,
		ticketAuth:     ticketSecret,
		internalSecret: "",
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/matches/"+matchID+"/session", nil)
	req = mux.SetURLVars(req, map[string]string{"id": matchID})
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	a.matchSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %q", rec.Code, rec.Body.String())
	}
	var resp contracts.MatchSessionResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Status != "live_connectable" {
		t.Fatalf("status = %q, want live_connectable", resp.Status)
	}
	if resp.MatchID != matchID || resp.Node != "node-1" || resp.WSPath != "/ws/node-1" || resp.Ticket == "" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}
