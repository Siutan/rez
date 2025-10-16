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
  riotTagLine: string
): Promise<ApiResponse<ChampionStats[]>> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/user-stats/${encodeURIComponent(riotUserName)}/${encodeURIComponent(riotTagLine)}`
    );

    return await response.json();
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
  championId: number
): Promise<ChampionStats | null> {
  const response = await getPlayerChampionStats(riotUserName, riotTagLine);
  
  if (!response.success || !response.data) {
    return null;
  }

  const championStat = response.data.find(
    (stat) => stat.champion_id === championId
  );

  return championStat || null;
}

