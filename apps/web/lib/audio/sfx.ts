export type SfxName =
  | 'chat'
  | 'select'
  | 'duel-game-start'
  | 'duel-round-countdown'
  | 'duel-round-guess'
  | 'duel-round-result-countdown'
  | 'duel-round-result-enter'
  | 'duel-round-result-exit'
  | 'duel-round-result-score-reveal'
  | 'duel-round-result-hp-hit';

export type SfxSource = {
  src: string;
  type: string;
};

export type SfxDefinition = {
  sources: readonly SfxSource[];
  volume?: number;
};

export type SfxRegistry = Record<SfxName, SfxDefinition>;

export interface SfxController {
  start(): void;
  destroy(): void;
  play(name: SfxName): void;
  playManaged(name: SfxName): void;
  playLoop(name: SfxName): void;
  stop(name: SfxName): void;
}

export const sfxRegistry: SfxRegistry = {
  chat: {
    sources: [{ src: '/sfx/chat.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.75
  },
  select: {
    sources: [{ src: '/sfx/select.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.75
  },
  'duel-game-start': {
    sources: [{ src: '/sfx/duel-game-start.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.85
  },
  'duel-round-guess': {
    sources: [{ src: '/sfx/duel-round-guess.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.8
  },
  'duel-round-countdown': {
    sources: [{ src: '/sfx/duel-round-countdown.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.75
  },
  'duel-round-result-countdown': {
    sources: [{ src: '/sfx/duel-round-result-countdown.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.75
  },
  'duel-round-result-enter': {
    sources: [{ src: '/sfx/duel-round-result-enter.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.85
  },
  'duel-round-result-score-reveal': {
    sources: [{ src: '/sfx/duel-round-result-score-reveal.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.9
  },
  'duel-round-result-hp-hit': {
    sources: [{ src: '/sfx/duel-round-result-hp-hit.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.55
  },
  'duel-round-result-exit': {
    sources: [{ src: '/sfx/duel-round-result-exit.ogg', type: 'audio/ogg; codecs=vorbis' }],
    volume: 0.8
  }
};

export class NullSfxController implements SfxController {
  start() {}

  destroy() {}

  play(_name: SfxName) {}

  playManaged(_name: SfxName) {}

  playLoop(_name: SfxName) {}

  stop(_name: SfxName) {}
}
