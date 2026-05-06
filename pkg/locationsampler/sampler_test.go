package locationsampler

import (
	"context"
	"testing"

	"geoduels/pkg/contracts"
)

type fakeDB struct {
	catalog string
	rows    []row
}

func (f *fakeDB) ActiveCatalogID(context.Context) (string, error) { return f.catalog, nil }
func (f *fakeDB) FetchRows(_ context.Context, _ string, _ float64, limit int) ([]row, error) {
	if limit > len(f.rows) {
		limit = len(f.rows)
	}
	out := make([]row, limit)
	copy(out, f.rows[:limit])
	return out, nil
}

func TestNextRoundCachesPerRound(t *testing.T) {
	db := &fakeDB{catalog: "v1", rows: []row{{ID: 1, Point: contracts.LocationPoint{Lat: 1, Lng: 2}}, {ID: 2, Point: contracts.LocationPoint{Lat: 3, Lng: 4}}}}
	s := New(db, newMemoryStateStore(defaultMatchTTL), Config{PoolTarget: 2, RefillBatch: 2, LowWatermark: 1})
	if err := s.Init(context.Background()); err != nil {
		t.Fatal(err)
	}
	p1, err := s.NextRound(context.Background(), "m1", 0)
	if err != nil {
		t.Fatal(err)
	}
	p2, err := s.NextRound(context.Background(), "m1", 0)
	if err != nil {
		t.Fatal(err)
	}
	if p1.Lat != p2.Lat || p1.Lng != p2.Lng {
		t.Fatalf("expected cached round point")
	}
}
