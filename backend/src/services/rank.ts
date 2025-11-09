import { $ } from "bun";

// Types for input and output
export interface SummonerKey {
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

// In-memory cache with 10-minute TTL
const TEN_MINUTES_MS = 10 * 60 * 1000;
type CacheEntry = { expiresAt: number; data: SummonerRankResult };
const rankCache = new Map<string, CacheEntry>();

function makeCacheKey(key: SummonerKey): string {
  return `${key.regionId}:${key.riotUserName.toLowerCase()}#${key.riotTagLine}`;
}

function isCacheValid(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && entry.expiresAt > Date.now();
}

// u.gg GraphQL endpoint and static query body
const UGG_API_URL = "https://u.gg/api";
const GET_SUMMONER_PROFILE_QUERY =
  "query getSummonerProfile($regionId: String!, $seasonId: Int!, $riotUserName: String!, $riotTagLine: String!) {\n  fetchProfileRanks(\n    riotUserName: $riotUserName\n    riotTagLine: $riotTagLine\n    regionId: $regionId\n    seasonId: $seasonId\n  ) {\n    rankScores {\n      lastUpdatedAt\n      losses\n      lp\n      promoProgress\n      queueType\n      rank\n      role\n      seasonId\n      tier\n      wins\n      __typename\n    }\n    __typename\n  }\n}";

async function fetchFromUGG(key: SummonerKey, seasonId = 25): Promise<SimplifiedRank[]> {
  const body = {
    operationName: "getSummonerProfile",
    variables: {
      regionId: key.regionId,
      riotUserName: key.riotUserName,
      riotTagLine: key.riotTagLine,
      seasonId,
    },
    query: GET_SUMMONER_PROFILE_QUERY,
  };

  const res = await fetch(UGG_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // minimal headers to avoid CORS issues when server-to-server
      "x-app-type": "web",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`u.gg request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const scores = json?.data?.fetchProfileRanks?.rankScores as
    | Array<{
        queueType: string;
        tier: string;
        rank: string;
        lp: number;
        wins: number;
        losses: number;
      }>
    | undefined;

  if (!scores || !Array.isArray(scores)) return [];

  return scores.map((s) => ({
    queueType: s.queueType,
    tier: s.tier,
    rank: s.rank,
    lp: s.lp ?? 0,
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
  }));
}

export async function fetchSummonerRanks(keys: SummonerKey[]): Promise<SummonerRankResult[]> {
  // Serve from cache when available; otherwise fetch in parallel
  const tasks = keys.map(async (key) => {
    const cacheKey = makeCacheKey(key);
    const cached = rankCache.get(cacheKey);
    if (isCacheValid(cached)) {
      return cached.data;
    }

    const ranks = await fetchFromUGG(key);
    const result: SummonerRankResult = {
      riotUserName: key.riotUserName,
      riotTagLine: key.riotTagLine,
      regionId: key.regionId,
      ranks,
    };

    rankCache.set(cacheKey, { data: result, expiresAt: Date.now() + TEN_MINUTES_MS });
    return result;
  });

  // Preserve input order
  return await Promise.all(tasks);
}

export function clearRankCache() {
  rankCache.clear();
}


