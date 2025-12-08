import { turso } from '../db/turso';
import { fetchAndParsePlayerStats, refreshPlayerProfile } from '../db/data/user-stats';
import type { ParsedUserStats } from '../db/data/user-stats';
import { userStatsUpdateQueue, determinePriority } from './update-queue';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000;

async function getLastProfileUpdateTimestamp(
  riotUserName: string,
  riotTagLine: string,
  regionId: string
): Promise<string | null> {
  const result = await turso.execute({
    sql: `
      SELECT last_updated_at FROM user_profile_updates
      WHERE riot_user_name = ? AND riot_tag_line = ? AND region_id = ?
      LIMIT 1
    `,
    args: [riotUserName, riotTagLine, regionId],
  });

  const lastUpdatedRaw = result.rows[0]?.last_updated_at;
  return typeof lastUpdatedRaw === 'string' ? lastUpdatedRaw : null;
}

async function recordProfileUpdateTimestamp(
  riotUserName: string,
  riotTagLine: string,
  regionId: string,
  timestamp: string
) {
  await turso.execute({
    sql: `
      INSERT INTO user_profile_updates (
        riot_user_name, riot_tag_line, region_id, last_updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(riot_user_name, riot_tag_line, region_id) DO UPDATE SET
        last_updated_at = excluded.last_updated_at
    `,
    args: [riotUserName, riotTagLine, regionId, timestamp],
  });
}

async function maybeUpdatePlayerProfile(params: {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
  isCurrentUser?: boolean;
}) {
  const { riotUserName, riotTagLine, regionId, isCurrentUser = false } = params;

  const lastUpdatedAt = await getLastProfileUpdateTimestamp(riotUserName, riotTagLine, regionId);
  const now = Date.now();
  const ageMs = lastUpdatedAt ? now - new Date(lastUpdatedAt).getTime() : Number.POSITIVE_INFINITY;

  // Global cooldown: always skip if updated within the last 10 minutes
  if (ageMs < TEN_MINUTES_MS) {
    console.log(
      `⏩ Skipping profile update for ${riotUserName}#${riotTagLine} (last update ${Math.round(
        ageMs / 1000
      )}s ago < 10m)`
    );
    return { updated: false, lastUpdatedAt, reason: 'cooldown' } as const;
  }

  const threshold = isCurrentUser ? TEN_MINUTES_MS : FORTY_FIVE_MINUTES_MS;
  const shouldUpdate = !lastUpdatedAt || ageMs >= threshold;

  if (!shouldUpdate) {
    return { updated: false, lastUpdatedAt, reason: 'recent' } as const;
  }

  try {
    console.log(
      `🔄 Updating player profile on U.GG for ${riotUserName}#${riotTagLine} ` +
        `(isCurrentUser=${isCurrentUser}, age=${Math.round(ageMs / 1000)}s)`
    );

    const result = await refreshPlayerProfile({ riotUserName, riotTagLine, regionId });

    if (!result.success) {
      console.warn(
        `⚠️ U.GG profile update reported failure for ${riotUserName}#${riotTagLine}: ${result.errorReason ?? 'unknown'}`
      );
      return { updated: false, lastUpdatedAt, reason: 'remote-failed' } as const;
    }

    const timestamp = new Date().toISOString();
    await recordProfileUpdateTimestamp(riotUserName, riotTagLine, regionId, timestamp);
    console.log(`✅ Profile updated on U.GG for ${riotUserName}#${riotTagLine}`);

    return { updated: true, lastUpdatedAt: timestamp, reason: 'updated' } as const;
  } catch (err) {
    console.error(`❌ Failed to update profile on U.GG for ${riotUserName}#${riotTagLine}:`, err);
    return { updated: false, lastUpdatedAt, reason: 'error' } as const;
  }
}

/**
 * Upsert user stats for a specific player
 */
export async function upsertUserStats(
  stats: ParsedUserStats,
  riotUserName: string,
  riotTagLine: string
) {
  const startTime = Date.now();

  try {
    console.log(`Upserting stats for ${riotUserName}#${riotTagLine} (${stats.champions.length} champions)...`);

    const upsertSql = `
      INSERT INTO user_champion_stats (
        puuid, riot_user_name, riot_tag_line, region_id, season_id, champion_id,
        assists, cs, damage, damage_taken, deaths,
        double_kills, first_place, gold, kills,
        max_deaths, max_kills, penta_kills, quadra_kills,
        total_matches, total_placement, triple_kills, wins,
        win_rate, avg_kda, avg_cs, avg_damage, avg_damage_taken, avg_gold,
        last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(puuid, champion_id) DO UPDATE SET
        riot_user_name = excluded.riot_user_name,
        riot_tag_line = excluded.riot_tag_line,
        region_id = excluded.region_id,
        season_id = excluded.season_id,
        assists = excluded.assists,
        cs = excluded.cs,
        damage = excluded.damage,
        damage_taken = excluded.damage_taken,
        deaths = excluded.deaths,
        double_kills = excluded.double_kills,
        first_place = excluded.first_place,
        gold = excluded.gold,
        kills = excluded.kills,
        max_deaths = excluded.max_deaths,
        max_kills = excluded.max_kills,
        penta_kills = excluded.penta_kills,
        quadra_kills = excluded.quadra_kills,
        total_matches = excluded.total_matches,
        total_placement = excluded.total_placement,
        triple_kills = excluded.triple_kills,
        wins = excluded.wins,
        win_rate = excluded.win_rate,
        avg_kda = excluded.avg_kda,
        avg_cs = excluded.avg_cs,
        avg_damage = excluded.avg_damage,
        avg_damage_taken = excluded.avg_damage_taken,
        avg_gold = excluded.avg_gold,
        last_updated_at = excluded.last_updated_at
    `;

    // Build batch operations
    const batch: Array<{ sql: string; args: any[] }> = [];

    for (const champ of stats.champions) {
      batch.push({
        sql: upsertSql,
        args: [
          stats.puuid,
          riotUserName,
          riotTagLine,
          stats.regionId,
          stats.seasonId,
          champ.championId,
          champ.assists,
          champ.cs,
          champ.damage,
          champ.damageTaken,
          champ.deaths,
          champ.doubleKills,
          champ.firstPlace,
          champ.gold,
          champ.kills,
          champ.maxDeaths,
          champ.maxKills,
          champ.pentaKills,
          champ.quadraKills,
          champ.totalMatches,
          champ.totalPlacement,
          champ.tripleKills,
          champ.wins,
          champ.winRate,
          champ.avgKDA,
          champ.avgCS,
          champ.avgDamage,
          champ.avgDamageTaken,
          champ.avgGold,
          stats.lastUpdatedAt,
        ],
      });
    }

    // Execute in transaction with batching
    await turso.execute('BEGIN');
    try {
      await turso.batch(batch, 'write');

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ User stats updated successfully in ${elapsed}s`);
      console.log(`   └─ ${stats.champions.length} champions for ${riotUserName}#${riotTagLine}`);
    } catch (err) {
      console.error('❌ Failed to update user stats:', err);
      throw err;
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ User stats update failed after ${elapsed}s:`, err);
    throw err;
  }
}

/**
 * Fetch and store user stats for a specific player
 */
export async function fetchAndStoreUserStats(params: {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
  isCurrentUser?: boolean;
}) {
  const { isCurrentUser = false, ...fetchParams } = params;

  console.log(`Fetching stats for ${params.riotUserName}#${params.riotTagLine}...`);

  // Refresh player profile before fetching stats, respecting throttling rules
  await maybeUpdatePlayerProfile({
    riotUserName: params.riotUserName,
    riotTagLine: params.riotTagLine,
    regionId: params.regionId,
    isCurrentUser,
  });

  const stats = await fetchAndParsePlayerStats({
    ...fetchParams,
    role: 7,        // all roles
    seasonId: 25,   // current season
    queueType: [400, 420, 440], // normal draft, ranked solo, ranked flex
  });

  await upsertUserStats(stats, params.riotUserName, params.riotTagLine);

  return stats;
}

/**
 * Get user stats from database by username and tagline
 * Always returns immediately from DB, queues background update if needed
 */
export async function getUserStats(
  riotUserName: string,
  riotTagLine: string,
  regionId?: string,
  isCurrentUser: boolean = false
) {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  
  // First, check if we have any data for this user
  const result = await turso.execute({
    sql: `
      SELECT last_updated_at FROM user_champion_stats
      WHERE riot_user_name = ? AND riot_tag_line = ?
      LIMIT 1
    `,
    args: [riotUserName, riotTagLine],
  });

  const hasData = result.rows.length > 0;
  const lastUpdatedAt = hasData ? result.rows[0]?.last_updated_at as string : null;
  
  // Determine data freshness
  let dataStatus: 'fresh' | 'stale' | 'expired' | 'missing';
  let needsUpdate = false;
  let priority: 'immediate' | 'high' | 'low' = 'low';

  if (!hasData) {
    dataStatus = 'missing';
    needsUpdate = true;
    priority = 'immediate';
  } else if (lastUpdatedAt) {
    const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
    if (ageMs > TWENTY_FOUR_HOURS_MS) {
      dataStatus = 'expired';
      needsUpdate = true;
      priority = 'high';
    } else if (ageMs > ONE_HOUR_MS) {
      dataStatus = 'stale';
      needsUpdate = true;
      priority = 'low';
    } else {
      dataStatus = 'fresh';
      needsUpdate = false;
    }
  } else {
    dataStatus = 'missing';
    needsUpdate = true;
    priority = 'immediate';
  }

  // Queue background update if needed
  if (needsUpdate && regionId) {
    const queuePriority = isCurrentUser ? 'immediate' : priority;
    userStatsUpdateQueue.enqueue({
      riotUserName,
      riotTagLine,
      regionId,
      isCurrentUser,
      priority: queuePriority,
    });
    
    console.log(`📝 Queued ${queuePriority} priority update for ${riotUserName}#${riotTagLine} (${dataStatus})`);
  }

  // Return the data (either existing fresh/stale data or empty array for missing)
  const finalResult = await turso.execute({
    sql: `
      SELECT * FROM user_champion_stats
      WHERE riot_user_name = ? AND riot_tag_line = ?
      ORDER BY total_matches DESC
    `,
    args: [riotUserName, riotTagLine],
  });

  return {
    data: finalResult.rows,
    status: dataStatus,
    lastUpdatedAt,
    needsUpdate,
    priority,
  };
}

