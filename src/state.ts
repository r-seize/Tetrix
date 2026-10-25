import * as vscode from 'vscode';

export interface TetrixState {
  gamesPlayedThisBreak: number;
  cooldownUntil: number | null;
  breaksToday: number;
  lastBreakDate: string | null;
}

const STATE_KEY = 'tetrix.state';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultState(): TetrixState {
  return {
    gamesPlayedThisBreak: 0,
    cooldownUntil: null,
    breaksToday: 0,
    lastBreakDate: null
  };
}

export class TetrixStateStore {
  constructor(private readonly memento: vscode.Memento) {}

  get(): TetrixState {
    const state = this.memento.get<TetrixState>(STATE_KEY) ?? defaultState();
    if (state.lastBreakDate !== todayKey()) {
      state.breaksToday = 0;
      state.lastBreakDate = todayKey();
    }
    return state;
  }

  async save(state: TetrixState): Promise<void> {
    await this.memento.update(STATE_KEY, state);
  }

  async reset(): Promise<void> {
    await this.memento.update(STATE_KEY, defaultState());
  }
}

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('tetrix');
  return {
    cooldownMinutes: cfg.get<number>('cooldownMinutes', 30),
    maxGamesPerBreak: cfg.get<number>('maxGamesPerBreak', 1),
    maxBreaksPerDay: cfg.get<number>('maxBreaksPerDay', 0),
    breakDurationMinutes: cfg.get<number>('breakDurationMinutes', 0),
    showStatusBarItem: cfg.get<boolean>('showStatusBarItem', true)
  };
}

export type AvailabilityReason =
  | 'available'
  | 'cooldown'
  | 'daily-limit';

export interface Availability {
  available: boolean;
  reason: AvailabilityReason;
  remainingMs?: number;
}

export function checkAvailability(state: TetrixState): Availability {
  const config = getConfig();
  const now = Date.now();

  if (state.cooldownUntil && now < state.cooldownUntil) {
    return { available: false, reason: 'cooldown', remainingMs: state.cooldownUntil - now };
  }

  if (config.maxBreaksPerDay > 0 && state.breaksToday >= config.maxBreaksPerDay) {
    return { available: false, reason: 'daily-limit' };
  }

  return { available: true, reason: 'available' };
}

export function formatRemaining(ms: number): string {
  const totalSeconds    = Math.max(0, Math.ceil(ms / 1000));
  const minutes         = Math.floor(totalSeconds / 60);
  const seconds         = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}min ${seconds.toString().padStart(2, '0')}s`;
}
