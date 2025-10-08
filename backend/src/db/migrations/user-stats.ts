import { turso } from '../turso';
import { fetchAndParsePlayerStats } from '../data/user-stats';
import type { ParsedUserStats } from '../data/user-stats';

/**
 * Create database schema for user stats (runs synchronously before server starts)
 */
export async function createUserStatsSchema() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS user_champion_stats (
      puuid             TEXT    NOT NULL,
      region_id         TEXT    NOT NULL,
      season_id         INTEGER NOT NULL,
      champion_id       INTEGER NOT NULL,
      assists           INTEGER NOT NULL,
      cs                INTEGER NOT NULL,
      damage            INTEGER NOT NULL,
      damage_taken      INTEGER NOT NULL,
      deaths            INTEGER NOT NULL,
      double_kills      INTEGER NOT NULL,
      first_place       INTEGER NOT NULL,
      gold              INTEGER NOT NULL,
      kills             INTEGER NOT NULL,
      max_deaths        INTEGER NOT NULL,
      max_kills         INTEGER NOT NULL,
      penta_kills       INTEGER NOT NULL,
      quadra_kills      INTEGER NOT NULL,
      total_matches     INTEGER NOT NULL,
      total_placement   INTEGER NOT NULL,
      triple_kills      INTEGER NOT NULL,
      wins              INTEGER NOT NULL,
      win_rate          REAL    NOT NULL,
      avg_kda           REAL    NOT NULL,
      avg_cs            REAL    NOT NULL,
      avg_damage        REAL    NOT NULL,
      avg_damage_taken  REAL    NOT NULL,
      avg_gold          REAL    NOT NULL,
      last_updated_at   TEXT    NOT NULL,
      PRIMARY KEY (puuid, champion_id)
    )
  `);

  console.log('✅ User champion stats schema created');
}

/**
 * Upsert user stats for a specific player
 */
export async function upsertUserStats(stats: ParsedUserStats) {
  const startTime = Date.now();

  try {
    console.log(`🔄 Upserting stats for ${stats.puuid} (${stats.champions.length} champions)...`);

    const upsertSql = `
      INSERT INTO user_champion_stats (
        puuid, region_id, season_id, champion_id,
        assists, cs, damage, damage_taken, deaths,
        double_kills, first_place, gold, kills,
        max_deaths, max_kills, penta_kills, quadra_kills,
        total_matches, total_placement, triple_kills, wins,
        win_rate, avg_kda, avg_cs, avg_damage, avg_damage_taken, avg_gold,
        last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(puuid, champion_id) DO UPDATE SET
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
      await turso.execute('COMMIT');

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ User stats updated successfully in ${elapsed}s`);
      console.log(`   └─ ${stats.champions.length} champions for ${stats.puuid}`);
    } catch (err) {
      console.error('❌ Failed to update user stats:', err);
      throw err;
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ User stats migration failed after ${elapsed}s:`, err);
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
}) {
  console.log(`📊 Fetching stats for ${params.riotUserName}#${params.riotTagLine}...`);

  const stats = await fetchAndParsePlayerStats({
    ...params,
    role: 7,        // all roles
    seasonId: 25,   // current season
    queueType: [400, 420, 440], // normal draft, ranked solo, ranked flex
  });

  await upsertUserStats(stats);

  return stats;
}

/**
 * Get user stats from database
 */
export async function getUserStats(puuid: string) {
  const result = await turso.execute({
    sql: `
      SELECT * FROM user_champion_stats
      WHERE puuid = ?
      ORDER BY total_matches DESC
    `,
    args: [puuid],
  });

  return result.rows;
}

