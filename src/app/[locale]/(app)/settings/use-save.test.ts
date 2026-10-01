// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSave, useSaveStatus } from './use-save';

/**
 * What a Settings field shows around a save. Both hooks promise the same two
 * things (see `use-save.ts`): a value is kept only when the server said ok, and
 * a *thrown* action ends the save like a refused one instead of leaving the
 * field disabled until reload.
 */

const OK = () => Promise.resolve({ ok: true });
const REFUSED = () => Promise.resolve({ ok: false });
const THROWS = () => Promise.reject(new Error('network dropped'));

/** An action the test finishes by hand, to look at the field while it is in flight. */
function deferred() {
  let finish!: (result: { ok: boolean }) => void;
  const action = () => new Promise<{ ok: boolean }>((resolve) => (finish = resolve));
  return { action, finish: (result: { ok: boolean }) => finish(result) };
}

describe('useSave — fields that disable while saving', () => {
  it('starts idle: controls enabled, no error', () => {
    const { result } = renderHook(() => useSave());
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('is pending while the action is in flight, and not after', async () => {
    const { result } = renderHook(() => useSave());
    const save = deferred();

    let landed!: Promise<boolean>;
    act(() => {
      landed = result.current.run(save.action);
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      save.finish({ ok: true });
      await landed;
    });
    expect(result.current.pending).toBe(false);
  });

  it('reports a save that landed, with no error', async () => {
    const { result } = renderHook(() => useSave());
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.run(OK);
    });
    expect(ok).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it('reports a refusal as an error, and re-enables the field', async () => {
    const { result } = renderHook(() => useSave());
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.run(REFUSED);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.pending).toBe(false);
  });

  it('treats a thrown action as a failed save rather than leaving the field stuck', async () => {
    const { result } = renderHook(() => useSave());
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.run(THROWS);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.pending).toBe(false);
  });

  it('clears an earlier error as soon as the next save starts', async () => {
    const { result } = renderHook(() => useSave());
    await act(async () => {
      await result.current.run(REFUSED);
    });
    const save = deferred();
    let landed!: Promise<boolean>;
    act(() => {
      landed = result.current.run(save.action);
    });
    expect(result.current.error).toBe(false);
    await act(async () => {
      save.finish({ ok: true });
      await landed;
    });
  });
});

describe('useSaveStatus — the free-text fields with a saved/error line', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useSaveStatus());
    expect(result.current.status).toBe('idle');
  });

  it('shows saving while in flight, then saved', async () => {
    const { result } = renderHook(() => useSaveStatus());
    const save = deferred();
    let landed!: Promise<boolean>;
    act(() => {
      landed = result.current.run(save.action);
    });
    expect(result.current.status).toBe('saving');

    let ok!: boolean;
    await act(async () => {
      save.finish({ ok: true });
      ok = await landed;
    });
    expect(ok).toBe(true);
    expect(result.current.status).toBe('saved');
  });

  it('shows error on a refusal and on a throw, and reports neither as landed', async () => {
    const { result } = renderHook(() => useSaveStatus());
    for (const action of [REFUSED, THROWS]) {
      let ok!: boolean;
      await act(async () => {
        ok = await result.current.run(action);
      });
      expect(ok).toBe(false);
      expect(result.current.status).toBe('error');
    }
  });

  it('reset puts a stale "saved" back to idle', async () => {
    const { result } = renderHook(() => useSaveStatus());
    await act(async () => {
      await result.current.run(OK);
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
  });

  it('a save that finishes after the athlete edited again is discarded, not painted as saved', async () => {
    const { result } = renderHook(() => useSaveStatus());
    const save = deferred();
    let landed!: Promise<boolean>;
    act(() => {
      landed = result.current.run(save.action);
    });
    act(() => result.current.reset());

    let ok!: boolean;
    await act(async () => {
      save.finish({ ok: true });
      ok = await landed;
    });
    // The field must not move its baseline to a draft the athlete has since changed.
    expect(ok).toBe(false);
    expect(result.current.status).toBe('idle');
  });

  it('a save from before an edit cannot speak for the save after it', async () => {
    // Save, edit, save again: the first save's late answer belongs to a draft
    // that is gone, and must not paint over the second save still in flight.
    const { result } = renderHook(() => useSaveStatus());
    const stale = deferred();
    const current = deferred();
    let staleLanded!: Promise<boolean>;
    let currentLanded!: Promise<boolean>;
    act(() => {
      staleLanded = result.current.run(stale.action);
    });
    act(() => result.current.reset());
    act(() => {
      currentLanded = result.current.run(current.action);
    });

    let staleOk!: boolean;
    await act(async () => {
      stale.finish({ ok: false });
      staleOk = await staleLanded;
    });
    expect(staleOk).toBe(false);
    expect(result.current.status).toBe('saving');

    await act(async () => {
      current.finish({ ok: true });
      await currentLanded;
    });
    expect(result.current.status).toBe('saved');
  });

  it('only the newest of two overlapping saves decides the status', async () => {
    const { result } = renderHook(() => useSaveStatus());
    const first = deferred();
    const second = deferred();
    let firstLanded!: Promise<boolean>;
    let secondLanded!: Promise<boolean>;
    act(() => {
      firstLanded = result.current.run(first.action);
    });
    act(() => {
      secondLanded = result.current.run(second.action);
    });

    await act(async () => {
      second.finish({ ok: true });
      await secondLanded;
    });
    let firstOk!: boolean;
    await act(async () => {
      first.finish({ ok: false });
      firstOk = await firstLanded;
    });
    expect(firstOk).toBe(false);
    expect(result.current.status).toBe('saved');
  });
});
