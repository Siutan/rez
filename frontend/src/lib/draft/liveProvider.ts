import type { DraftState, LcuChampSelectSession } from './types';
import { draftState } from './store';
import { mapFromLCU } from './mapping';

/**
 * Live provider used inside the Wails app.
 *
 * NOTE: This file should only be imported from the desktop app bundle
 * (e.g. `App.svelte`), not from the pure browser preview entry, to avoid
 * pulling in the Wails runtime where it doesn't exist.
 */
export function pushLiveDraftUpdate(raw: LcuChampSelectSession) {
  const mapped: DraftState = mapFromLCU(raw);
  draftState.set(mapped);
}

export function clearLiveDraft() {
  draftState.set(null);
}


