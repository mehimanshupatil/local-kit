import { describe, expect, it } from 'vitest';
import { createHistory, pushHistory, redo, undo } from './gridHistory';

describe('gridHistory', () => {
  it('undoes and redoes pushed states', () => {
    let h = createHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    h = redo(h);
    expect(h.present).toBe('b');
  });

  it('coalesces consecutive pushes with the same key into one step', () => {
    let h = createHistory('');
    h = pushHistory(h, 'h', 'cell:0-0');
    h = pushHistory(h, 'hi', 'cell:0-0');
    expect(undo(h).present).toBe('');
  });

  it('starts a new step when the key changes or after an undo', () => {
    let h = createHistory('');
    h = pushHistory(h, 'a', 'cell:0-0');
    h = pushHistory(h, 'ab', 'cell:0-1');
    expect(undo(h).present).toBe('a');
    h = pushHistory(undo(h), 'ax', 'cell:0-0');
    expect(undo(h).present).toBe('a');
  });

  it('drops the redo stack on a new push', () => {
    let h = pushHistory(createHistory(1), 2);
    h = pushHistory(undo(h), 3);
    expect(redo(h).present).toBe(3);
  });

  it('ignores pushes of the identical state', () => {
    const h = createHistory([1]);
    expect(pushHistory(h, h.present)).toBe(h);
  });

  it('caps the number of undo steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = pushHistory(h, i, null, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });

  it('is a no-op at either end', () => {
    const h = createHistory('x');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
