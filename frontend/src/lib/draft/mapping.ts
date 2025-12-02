import type {
  DraftBans,
  DraftState,
  DraftTimer,
  DraftPlayerSlot,
  LcuChampSelectSession,
} from './types';

function mapTimer(raw?: LcuChampSelectSession['timer']): DraftTimer | null {
  if (!raw) return null;

  return {
    phase: raw.phase,
    timeRemainingMs: raw.adjustedTimeLeftInPhase,
    totalTimeMs: raw.totalTimeInPhase,
    internalNowInEpochMs: raw.internalNowInEpochMs,
    isInfinite: raw.isInfinite,
  };
}

function mapBans(raw: LcuChampSelectSession['bans']): DraftBans {
  return {
    myTeamBans: Array.isArray(raw?.myTeamBans) ? raw.myTeamBans.slice() : [],
    theirTeamBans: Array.isArray(raw?.theirTeamBans) ? raw.theirTeamBans.slice() : [],
    numBans: typeof raw?.numBans === 'number' ? raw.numBans : 0,
  };
}

function mapPlayerSlot(p: LcuChampSelectSession['myTeam'][number]): DraftPlayerSlot {
  return {
    cellId: p.cellId ?? -1,
    assignedPosition: p.assignedPosition,
    championId: p.championId ?? 0,
    championPickIntent: p.championPickIntent ?? 0,
    summonerId: p.summonerId ?? 0,
    gameName: p.gameName,
    tagLine: p.tagLine,
    puuid: p.puuid,
    spell1Id: p.spell1Id ?? 0,
    spell2Id: p.spell2Id ?? 0,
    selectedSkinId: p.selectedSkinId ?? 0,
    team: p.team ?? 0,
    wardSkinId: p.wardSkinId ?? 0,
    nameVisibilityType: p.nameVisibilityType,
  };
}

/**
 * Map a raw LCU champ select session into a cleaner DraftState used by the UI.
 * This function is intentionally pure and side‑effect free so it can be unit tested
 * and reused by both live and mock providers.
 */
export function mapFromLCU(raw: LcuChampSelectSession): DraftState {
  const myTeam = Array.isArray(raw?.myTeam) ? raw.myTeam.map(mapPlayerSlot) : [];
  const theirTeam = Array.isArray(raw?.theirTeam) ? raw.theirTeam.map(mapPlayerSlot) : [];

  return {
    myTeam,
    theirTeam,
    bans: mapBans(raw.bans),
    localPlayerCellId:
      typeof raw?.localPlayerCellId === 'number' ? raw.localPlayerCellId : -1,
    timer: mapTimer(raw.timer),
    gameId: typeof raw?.gameId === 'number' ? raw.gameId : null,
    queueId: typeof raw?.queueId === 'number' ? raw.queueId : null,
    isCustomGame: Boolean(raw?.isCustomGame),
    isSpectating: Boolean(raw?.isSpectating),
  };
}


