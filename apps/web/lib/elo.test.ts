import { describe, expect, it } from 'vitest';
import { calculateDuelEloDeltas, MAX_DUEL_MMR_DELTA } from './elo';

describe('calculateDuelEloDeltas', () => {
  it('moves high-RD players quickly and lowers rating uncertainty', () => {
    const result = calculateDuelEloDeltas(1500, 1500, 'self', 350, 350);

    expect(result.selfDelta).toBe(MAX_DUEL_MMR_DELTA);
    expect(result.opponentDelta).toBe(-MAX_DUEL_MMR_DELTA);
    expect(result.selfRatingRd).toBeLessThan(350);
    expect(result.opponentRatingRd).toBeLessThan(350);
  });

  it('keeps established equal players near a thirty-point move', () => {
    const result = calculateDuelEloDeltas(1500, 1500, 'self', 110, 110);

    expect(result.selfDelta).toBeGreaterThanOrEqual(28);
    expect(result.selfDelta).toBeLessThanOrEqual(32);
    expect(result.opponentDelta).toBeLessThanOrEqual(-28);
    expect(result.opponentDelta).toBeGreaterThanOrEqual(-32);
  });
});
