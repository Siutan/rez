// parser.ts - Parse and aggregate U.GG player stats

import type {
  UGGPlayerStatsResponse,
  BasicChampionPerformance,
  AggregatedChampionStats,
  ParsedUserStats,
} from './types';

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

/**
 * Aggregate champion performances across multiple queue types
 */
function aggregateChampionStats(
  performances: BasicChampionPerformance[]
): AggregatedChampionStats {
  // Sum all numeric fields
  const totals = performances.reduce(
    (acc, perf) => ({
      assists: acc.assists + perf.assists,
      cs: acc.cs + perf.cs,
      damage: acc.damage + perf.damage,
      damageTaken: acc.damageTaken + perf.damageTaken,
      deaths: acc.deaths + perf.deaths,
      doubleKills: acc.doubleKills + perf.doubleKills,
      firstPlace: acc.firstPlace + perf.firstPlace,
      gold: acc.gold + perf.gold,
      kills: acc.kills + perf.kills,
      maxDeaths: Math.max(acc.maxDeaths, perf.maxDeaths),
      maxKills: Math.max(acc.maxKills, perf.maxKills),
      pentaKills: acc.pentaKills + perf.pentaKills,
      quadraKills: acc.quadraKills + perf.quadraKills,
      totalMatches: acc.totalMatches + perf.totalMatches,
      totalPlacement: acc.totalPlacement + perf.totalPlacement,
      tripleKills: acc.tripleKills + perf.tripleKills,
      wins: acc.wins + perf.wins,
    }),
    {
      assists: 0,
      cs: 0,
      damage: 0,
      damageTaken: 0,
      deaths: 0,
      doubleKills: 0,
      firstPlace: 0,
      gold: 0,
      kills: 0,
      maxDeaths: 0,
      maxKills: 0,
      pentaKills: 0,
      quadraKills: 0,
      totalMatches: 0,
      totalPlacement: 0,
      tripleKills: 0,
      wins: 0,
    }
  );

  const championId = performances[0].championId;
  const totalMatches = totals.totalMatches;

  // Calculate computed fields
  const winRate = safeDiv(totals.wins, totalMatches) * 100;
  const avgKDA = safeDiv(totals.kills + totals.assists, Math.max(1, totals.deaths));
  const avgCS = safeDiv(totals.cs, totalMatches);
  const avgDamage = safeDiv(totals.damage, totalMatches);
  const avgDamageTaken = safeDiv(totals.damageTaken, totalMatches);
  const avgGold = safeDiv(totals.gold, totalMatches);

  return {
    championId,
    ...totals,
    winRate: +winRate.toFixed(2),
    avgKDA: +avgKDA.toFixed(2),
    avgCS: +avgCS.toFixed(1),
    avgDamage: +avgDamage.toFixed(0),
    avgDamageTaken: +avgDamageTaken.toFixed(0),
    avgGold: +avgGold.toFixed(0),
  };
}

/**
 * Parse U.GG player stats response and aggregate across all queue types
 */
export function parsePlayerStats(response: UGGPlayerStatsResponse): ParsedUserStats {
  const { fetchPlayerStatistics } = response.data;

  if (!fetchPlayerStatistics || fetchPlayerStatistics.length === 0) {
    throw new Error('No player statistics found in response');
  }

  // Use first entry for metadata (they all share same puuid, region, season)
  const firstEntry = fetchPlayerStatistics[0];
  const { puuid, regionId, seasonId } = firstEntry;

  // Group champion performances by championId across all queue types
  const championMap = new Map<number, BasicChampionPerformance[]>();

  for (const queueStats of fetchPlayerStatistics) {
    for (const perf of queueStats.basicChampionPerformances) {
      const existing = championMap.get(perf.championId) || [];
      existing.push(perf);
      championMap.set(perf.championId, existing);
    }
  }

  // Aggregate stats for each champion
  const champions: AggregatedChampionStats[] = [];
  for (const [championId, performances] of championMap.entries()) {
    champions.push(aggregateChampionStats(performances));
  }

  // Sort by total matches descending
  champions.sort((a, b) => b.totalMatches - a.totalMatches);

  return {
    puuid,
    regionId,
    seasonId,
    champions,
    lastUpdatedAt: new Date().toISOString(),
  };
}

