// types.ts - User Stats from U.GG API

/**
 * RAW API RESPONSE SHAPE
 */
export interface BasicChampionPerformance {
  __typename: string;
  assists: number;
  championId: number;
  cs: number;
  damage: number;
  damageTaken: number;
  deaths: number;
  doubleKills: number;
  firstPlace: number;
  gold: number;
  kills: number;
  lpAvg: number;
  maxDeaths: number;
  maxKills: number;
  pentaKills: number;
  quadraKills: number;
  totalMatches: number;
  totalPlacement: number;
  tripleKills: number;
  wins: number;
}

export interface PlayerStatistics {
  __typename: string;
  basicChampionPerformances: BasicChampionPerformance[];
  exodiaUuid: string;
  puuid: string;
  queueType: number;
  regionId: string;
  role: number;
  seasonId: number;
}

export interface UGGPlayerStatsResponse {
  data: {
    fetchPlayerStatistics: PlayerStatistics[];
  };
}

/**
 * AGGREGATED OUTPUT SHAPE (merged across all queues)
 */
export interface AggregatedChampionStats {
  championId: number;
  assists: number;
  cs: number;
  damage: number;
  damageTaken: number;
  deaths: number;
  doubleKills: number;
  firstPlace: number;
  gold: number;
  kills: number;
  maxDeaths: number;
  maxKills: number;
  pentaKills: number;
  quadraKills: number;
  totalMatches: number;
  totalPlacement: number;
  tripleKills: number;
  wins: number;
  // Computed fields
  winRate: number;        // % (0-100)
  avgKDA: number;         // (kills + assists) / max(1, deaths)
  avgCS: number;          // cs per game
  avgDamage: number;      // damage per game
  avgDamageTaken: number; // damage taken per game
  avgGold: number;        // gold per game
}

export interface ParsedUserStats {
  puuid: string;
  regionId: string;
  seasonId: number;
  champions: AggregatedChampionStats[];
  lastUpdatedAt: string;
}

