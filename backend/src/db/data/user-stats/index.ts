// index.ts - Fetch and parse user stats from U.GG

import type { UGGPlayerStatsResponse, ParsedUserStats } from './types';
import { parsePlayerStats } from './parser';
import { updatePlayerProfile } from './update-profile';

export * from './types';
export * from './parser';
export * from './update-profile';

const UGG_API_URL = 'https://u.gg/api';

export interface FetchPlayerStatsParams {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
  role?: number;      // 7 = all roles
  seasonId?: number;  // 25 = current season
  queueType?: number[]; // [400, 420, 440] = normal draft, ranked solo, ranked flex
}

const PLAYER_STATS_QUERY = `query getPlayerStats($queueType: [Int!], $regionId: String!, $role: Int!, $seasonId: Int!, $riotUserName: String!, $riotTagLine: String!) {
  fetchPlayerStatistics(
    queueType: $queueType
    riotUserName: $riotUserName
    riotTagLine: $riotTagLine
    regionId: $regionId
    role: $role
    seasonId: $seasonId
  ) {
    basicChampionPerformances {
      assists
      championId
      cs
      damage
      damageTaken
      deaths
      doubleKills
      gold
      kills
      maxDeaths
      maxKills
      pentaKills
      quadraKills
      totalMatches
      tripleKills
      wins
      lpAvg
      firstPlace
      totalPlacement
      __typename
    }
    exodiaUuid
    puuid
    queueType
    regionId
    role
    seasonId
    __typename
  }
}`;

/**
 * Fetch player stats from U.GG API
 */
export async function fetchPlayerStats(
  params: FetchPlayerStatsParams
): Promise<UGGPlayerStatsResponse> {
  const {
    riotUserName,
    riotTagLine,
    regionId,
    role = 7,
    seasonId = 25,
    queueType = [400, 420, 440],
  } = params;

  const requestBody = {
    operationName: 'getPlayerStats',
    variables: {
      riotUserName,
      riotTagLine,
      regionId,
      role,
      seasonId,
      queueType,
    },
    query: PLAYER_STATS_QUERY,
  };

  const response = await fetch(UGG_API_URL, {
    method: 'POST',
    headers: {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'origin': 'https://u.gg',
      'referer': 'https://u.gg/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-app-type': 'web',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`U.GG API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch and parse player stats in one call
 */
export async function fetchAndParsePlayerStats(
  params: FetchPlayerStatsParams
): Promise<ParsedUserStats> {
  const response = await fetchPlayerStats(params);
  return parsePlayerStats(response);
}

/**
 * Trigger a profile refresh on U.GG
 */
export async function refreshPlayerProfile(params: {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
}) {
  return updatePlayerProfile(params);
}

