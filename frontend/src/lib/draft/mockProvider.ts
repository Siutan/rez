import { draftState } from './store';
import { blueBanPhase } from './mockStates';

/**
 * Simple mock provider used by the preview entry or for offline dev.
 * Right now it just loads a static state; you can extend this later to
 * simulate timers and phase transitions.
 */
export function startMockDraft() {
  draftState.set(blueBanPhase);
}

export function stopMockDraft() {
  draftState.set(null);
}


