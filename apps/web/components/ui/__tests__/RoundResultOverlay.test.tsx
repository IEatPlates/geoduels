import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoundResultOverlay from '../RoundResultOverlay';
import type { RoundResultOverlayProps } from '../types';

function createProps(overrides: Partial<RoundResultOverlayProps> = {}): RoundResultOverlayProps {
  return {
    roundNumber: 3,
    mapNode: <div>Map Node</div>,
    phase: 'scores',
    showScoreReveal: true,
    winner: 'self',
    damage: 123,
    damageMultiplier: 1.5,
    players: {
      self: { name: 'You', fallback: 'Y', hp: 4000, score: 4321 },
      opp: { name: 'Opp', fallback: 'O', hp: 3200, score: 1111 }
    },
    hpPct: (hp) => `${Math.max(0, Math.min(100, (hp / 6000) * 100))}%`,
    ...overrides
  };
}

describe('RoundResultOverlay component', () => {
  it('does not render score travel token on tie', () => {
    render(
      <RoundResultOverlay
        {...createProps({
          phase: 'crush',
          winner: 'tie',
          damage: 0,
          players: {
            self: { name: 'You', fallback: 'Y', hp: 4000, score: 2500 },
            opp: { name: 'Opp', fallback: 'O', hp: 3200, score: 2500 }
          }
        })}
      />
    );

    expect(screen.queryByTestId('score-travel-token')).not.toBeInTheDocument();
  });

  it('renders score travel token in crush phase for non-tie with damage', async () => {
    render(<RoundResultOverlay {...createProps({ phase: 'crush', winner: 'self', damage: 321 })} />);

    await waitFor(() => {
      expect(screen.getByTestId('score-travel-token')).toBeInTheDocument();
    });
  });

  it('reveals the damage multiplier and updates the shown damage when the multiplier phase starts', () => {
    render(
      <RoundResultOverlay
        {...createProps({
          phase: 'damage_multiplier',
          winner: 'self',
          damage: 123,
          damageMultiplier: 1.5
        })}
      />
    );

    expect(screen.getByTestId('damage-multiplier-label')).toHaveTextContent('1.5x');
    expect(screen.getByText('185')).toBeInTheDocument();
  });
});
