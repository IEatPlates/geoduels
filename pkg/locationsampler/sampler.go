package locationsampler

import (
	"context"
	"errors"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"geoduels/pkg/contracts"
)

const (
	defaultPoolTarget   = 20000
	defaultLowWatermark = 4000
	defaultRefillBatch  = 16000
	defaultMatchTTL     = 2 * time.Hour
)

type row struct {
	ID    int64
	Point contracts.LocationPoint
}

type stateStore interface {
	GetRound(matchID string, roundIndex int) (contracts.LocationPoint, bool, error)
	SaveRound(matchID string, roundIndex int, p contracts.LocationPoint) error
	MarkUsed(matchID string, locationID int64) (bool, error)
}

type dbStore interface {
	ActiveCatalogID(ctx context.Context) (string, error)
	FetchRows(ctx context.Context, catalogID string, after float64, limit int) ([]row, error)
}

type Config struct {
	PoolTarget   int
	LowWatermark int
	RefillBatch  int
	MatchTTL     time.Duration
}

type Sampler struct {
	mu sync.Mutex

	cfg Config
	db  dbStore
	st  stateStore

	catalogID string
	pool      []row

	refilling atomic.Bool
	rand      *rand.Rand
}

func New(db dbStore, st stateStore, cfg Config) *Sampler {
	if cfg.PoolTarget <= 0 {
		cfg.PoolTarget = defaultPoolTarget
	}
	if cfg.LowWatermark <= 0 {
		cfg.LowWatermark = defaultLowWatermark
	}
	if cfg.RefillBatch <= 0 {
		cfg.RefillBatch = defaultRefillBatch
	}
	if cfg.MatchTTL <= 0 {
		cfg.MatchTTL = defaultMatchTTL
	}
	return &Sampler{
		cfg:  cfg,
		db:   db,
		st:   st,
		rand: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *Sampler) Init(ctx context.Context) error {
	catalogID, err := s.db.ActiveCatalogID(ctx)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.catalogID = catalogID
	s.mu.Unlock()
	return s.refillSync(ctx, s.cfg.PoolTarget)
}

func (s *Sampler) NextRound(ctx context.Context, matchID string, roundIndex int) (contracts.LocationPoint, error) {
	if matchID == "" {
		return contracts.LocationPoint{}, errors.New("matchID required")
	}
	if roundIndex < 0 {
		return contracts.LocationPoint{}, errors.New("roundIndex must be >= 0")
	}
	if p, ok, err := s.st.GetRound(matchID, roundIndex); err != nil {
		return contracts.LocationPoint{}, err
	} else if ok {
		return p, nil
	}
	if err := s.ensureInitialized(ctx); err != nil {
		return contracts.LocationPoint{}, err
	}

	for attempts := 0; attempts < 12; attempts++ {
		entry, err := s.draw(ctx)
		if err != nil {
			return contracts.LocationPoint{}, err
		}
		fresh, err := s.st.MarkUsed(matchID, entry.ID)
		if err != nil {
			return contracts.LocationPoint{}, err
		}
		if !fresh {
			continue
		}
		if err := s.st.SaveRound(matchID, roundIndex, entry.Point); err != nil {
			return contracts.LocationPoint{}, err
		}
		return entry.Point, nil
	}

	entry, err := s.draw(ctx)
	if err != nil {
		return contracts.LocationPoint{}, err
	}
	_, _ = s.st.MarkUsed(matchID, entry.ID)
	if err := s.st.SaveRound(matchID, roundIndex, entry.Point); err != nil {
		return contracts.LocationPoint{}, err
	}
	return entry.Point, nil
}

func (s *Sampler) ensureInitialized(ctx context.Context) error {
	s.mu.Lock()
	catalogID := s.catalogID
	s.mu.Unlock()
	if catalogID != "" {
		return nil
	}
	return s.Init(ctx)
}

func (s *Sampler) draw(ctx context.Context) (row, error) {
	s.mu.Lock()
	if len(s.pool) == 0 {
		s.mu.Unlock()
		if err := s.refillSync(ctx, s.cfg.RefillBatch); err != nil {
			return row{}, err
		}
		s.mu.Lock()
	}
	if len(s.pool) == 0 {
		s.mu.Unlock()
		return row{}, errors.New("location pool is empty")
	}
	i := s.rand.Intn(len(s.pool))
	entry := s.pool[i]
	last := len(s.pool) - 1
	s.pool[i] = s.pool[last]
	s.pool = s.pool[:last]
	needAsyncRefill := len(s.pool) < s.cfg.LowWatermark
	s.mu.Unlock()

	if needAsyncRefill {
		s.refillAsync()
	}
	return entry, nil
}

func (s *Sampler) refillAsync() {
	if !s.refilling.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer s.refilling.Store(false)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.refillSync(ctx, s.cfg.RefillBatch)
	}()
}

func (s *Sampler) refillSync(ctx context.Context, want int) error {
	s.mu.Lock()
	catalogID := s.catalogID
	s.mu.Unlock()
	if catalogID == "" {
		return errors.New("catalog not initialized")
	}
	after := rand.Float64()
	rows, err := s.db.FetchRows(ctx, catalogID, after, want)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	s.mu.Lock()
	s.pool = append(s.pool, rows...)
	s.mu.Unlock()
	return nil
}
