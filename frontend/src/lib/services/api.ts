// API service for communicating with the backend

const API_BASE_URL = 'http://localhost:3000';

export interface ChampionStats {
  champion_id: number;
  total_matches: number;
  wins: number;
  win_rate: number;
  avg_kda: number;
  avg_cs: number;
  avg_damage: number;
  avg_damage_taken: number;
  avg_gold: number;
  kills: number;
  deaths: number;
  assists: number;
  max_kills: number;
  max_deaths: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
}

export interface StoreChampionsParams {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// -------- RANK LOOKUP --------
export interface RankLookupInput {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
}

export interface SimplifiedRank {
  queueType: string;
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
}

export interface SummonerRankResult {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
  ranks: SimplifiedRank[];
}

const RANK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function rankCacheKey(user: string, tag: string) {
  return `rank_cache_${user.toLowerCase()}_${tag}`;
}

export function clearAllRankCache() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith("rank_cache_")) keys.push(key);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

export async function fetchSummonerRanks(input: RankLookupInput[]): Promise<ApiResponse<SummonerRankResult[]>> {
  // Try to fulfill from cache when all requested entries are fresh
  const now = Date.now();
  const cachedResults: SummonerRankResult[] = [];
  let allCached = true;

  for (const s of input) {
    const key = rankCacheKey(s.riotUserName, s.riotTagLine);
    const raw = localStorage.getItem(key);
    if (!raw) {
      allCached = false;
      break;
    }
    try {
      const parsed = JSON.parse(raw) as { ts: number; data: SummonerRankResult };
      if (parsed.ts + RANK_CACHE_TTL_MS < now) {
        allCached = false;
        break;
      }
      cachedResults.push(parsed.data);
    } catch {
      allCached = false;
      break;
    }
  }

  if (allCached && cachedResults.length === input.length) {
    return { success: true, data: cachedResults };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summoners: input }),
    });
    const json: ApiResponse<SummonerRankResult[]> = await response.json();
    if (json.success && json.data) {
      // Cache each entry individually
      json.data.forEach((entry) => {
        const key = rankCacheKey(entry.riotUserName, entry.riotTagLine);
        localStorage.setItem(key, JSON.stringify({ ts: now, data: entry }));
      });
    }
    return json;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Store champion stats for a player
 */
export async function storePlayerChampions(params: StoreChampionsParams): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/user-stats/champions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get champion stats for a player
 */
export async function getPlayerChampionStats(
  riotUserName: string,
  riotTagLine: string,
  regionId?: string
): Promise<ApiResponse<ChampionStats[]>> {
  try {
    // Build URL with optional regionId query parameter
    const url = new URL(
      `${API_BASE_URL}/user-stats/${encodeURIComponent(riotUserName)}/${encodeURIComponent(riotTagLine)}`
    );
    if (regionId) {
      url.searchParams.set('regionId', regionId);
    }

    const response = await fetch(url.toString());
    const result: ApiResponse<ChampionStats[]> = await response.json();

    // If no data found and we have regionId, try to store data first
    if (!result.success || !result.data || result.data.length === 0) {
      if (regionId) {
        console.log(`No stats found for ${riotUserName}#${riotTagLine}, attempting to fetch and store...`);
        
        // Try to store the data first
        const storeResult = await storePlayerChampions({
          riotUserName,
          riotTagLine,
          regionId,
        });

        if (storeResult.success) {
          // Retry the GET request after storing
          const retryResponse = await fetch(url.toString());
          const retryResult: ApiResponse<ChampionStats[]> = await retryResponse.json();
          return retryResult;
        }
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get stats for a specific champion for a player
 */
export async function getChampionStat(
  riotUserName: string,
  riotTagLine: string,
  championId: number,
  regionId?: string
): Promise<ChampionStats | null> {
  const response = await getPlayerChampionStats(riotUserName, riotTagLine, regionId);
  
  if (!response.success || !response.data) {
    return null;
  }

  const championStat = response.data.find(
    (stat) => stat.champion_id === championId
  );

  return championStat || null;
}

