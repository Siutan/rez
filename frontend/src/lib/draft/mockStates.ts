import type { DraftState, LcuChampSelectSession } from './types';
import { mapFromLCU } from './mapping';

// These JSON fixtures live under `frontend/src/mocks/draft`.
// They approximate real LCU champ select payloads closely enough for UI work.
// You can overwrite them later with real captures from your own client.
import blueBanPhaseRaw from '../../mocks/draft/blue_side_ban_phase.json';
import redFirstPickRaw from '../../mocks/draft/red_side_first_pick.json';

function asDraftState(raw: unknown): DraftState {
  return mapFromLCU(raw as LcuChampSelectSession);
}

export const blueBanPhase: DraftState = asDraftState(blueBanPhaseRaw);
export const redFirstPick: DraftState = asDraftState(redFirstPickRaw);

export const mockDraftStates: Record<string, DraftState> = {
  blueBanPhase,
  redFirstPick,
};


