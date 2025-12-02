export type DraftPhase = 'BAN' | 'PICK' | 'FINAL' | string;

export interface DraftTimer {
  phase: DraftPhase;
  /** Time left in the current phase in milliseconds */
  timeRemainingMs: number;
  /** Total duration of the current phase in milliseconds */
  totalTimeMs: number;
  /** Epoch ms according to the client when this snapshot was taken */
  internalNowInEpochMs: number;
  isInfinite: boolean;
}

export interface DraftBans {
  myTeamBans: number[];
  theirTeamBans: number[];
  numBans: number;
}

export interface DraftPlayerSlot {
  cellId: number;
  assignedPosition?: string;
  championId: number;
  championPickIntent: number;
  summonerId: number;
  gameName?: string;
  tagLine?: string;
  puuid?: string;
  spell1Id: number;
  spell2Id: number;
  selectedSkinId: number;
  team: number;
  wardSkinId: number;
  nameVisibilityType?: string;
}

export interface DraftState {
  myTeam: DraftPlayerSlot[];
  theirTeam: DraftPlayerSlot[];
  bans: DraftBans;
  localPlayerCellId: number;
  timer: DraftTimer | null;
  gameId: number | null;
  queueId: number | null;
  isCustomGame: boolean;
  isSpectating: boolean;
}

/**
 * Shape of the raw champ select payload coming from the Go connector / LCU.
 * This mirrors the Go `ChampSelectSession` type in `connector.go`.
 */
export interface LcuChampSelectSession {
  actions: Array<
    Array<{
      actorCellId: number;
      championId: number;
      completed: boolean;
      isAllyAction: boolean;
      isInProgress: boolean;
      type: string;
      pickTurn: number;
      duration: number;
      id: number;
    }>
  >;
  bans: {
    myTeamBans: number[];
    theirTeamBans: number[];
    numBans: number;
  };
  myTeam: Array<{
    cellId: number;
    assignedPosition: string;
    championId: number;
    championPickIntent: number;
    summonerId: number;
    gameName: string;
    tagLine: string;
    puuid: string;
    spell1Id: number;
    spell2Id: number;
    selectedSkinId: number;
    team: number;
    wardSkinId: number;
    nameVisibilityType: string;
  }>;
  theirTeam: Array<{
    cellId: number;
    assignedPosition: string;
    championId: number;
    championPickIntent: number;
    summonerId: number;
    gameName: string;
    tagLine: string;
    puuid: string;
    spell1Id: number;
    spell2Id: number;
    selectedSkinId: number;
    team: number;
    wardSkinId: number;
    nameVisibilityType: string;
  }>;
  localPlayerCellId: number;
  timer?: {
    phase: string;
    adjustedTimeLeftInPhase: number;
    internalNowInEpochMs: number;
    totalTimeInPhase: number;
    isInfinite: boolean;
  };
  gameId: number;
  queueId: number;
  isCustomGame: boolean;
  isSpectating: boolean;
  counter: number;
  allowSkinSelection: boolean;
  allowRerolling: boolean;
  benchEnabled: boolean;
  rerollsRemaining: number;
}


