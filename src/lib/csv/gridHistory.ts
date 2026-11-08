/** Undo/redo stack. Consecutive pushes with the same `key` coalesce into one step (e.g. typing in one cell). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
}

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null };
}

export function pushHistory<T>(h: History<T>, next: T, key: string | null = null, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey) return { ...h, present: next, future: [] };
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [], lastKey: key };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null };
}
