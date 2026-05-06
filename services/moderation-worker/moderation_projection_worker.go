package main

import (
	"context"
	"time"

	"geoduels/pkg/observability"
)

const (
	moderationProjectionInterval = 30 * time.Second
	moderationProjectionBatch    = 100
)

func (w *worker) startModerationProjectionWorker(ctx context.Context) {
	go w.runModerationProjectionWorker(ctx)
}

func (w *worker) runModerationProjectionWorker(ctx context.Context) {
	ticker := time.NewTicker(moderationProjectionInterval)
	defer ticker.Stop()
	for {
		w.recomputeModerationProjections(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (w *worker) recomputeModerationProjections(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	count, err := w.store.RecomputeModerationProjections(moderationProjectionBatch)
	if err != nil {
		observability.Log("warn", "moderation projection recompute failed", map[string]any{"error": err.Error()})
		return
	}
	if count > 0 {
		observability.Log("debug", "moderation projections recomputed", map[string]any{"count": count})
	}
}
