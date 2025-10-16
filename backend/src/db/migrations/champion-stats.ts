import { turso } from '../turso';
import { fetchAndParse } from '../data/champion-stats';
import {
  isDataStale,
  formatDuration,
  TIME_CONSTANTS,
  versionToPatch,
} from './utils';

const STALE_THRESHOLD_MS = TIME_CONSTANTS.ONE_DAY;

/**
 * Get the current patch stored in the database
 */
async function getCurrentDbPatch(): Promise<string | null> {
  try {
    const result = await turso.execute(`
      SELECT patch FROM champion_stats 
      WHERE patch != 'unknown'
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].patch as string;
  } catch (err) {
    return null;
  }
}

/**
 * Create database schema (runs synchronously before server starts)
 */
export async function createSchema() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS champion_stats (
      champion_id       TEXT    NOT NULL,
      role              TEXT    NOT NULL,
      patch             TEXT    NOT NULL DEFAULT 'unknown',
      matches           INTEGER NOT NULL,
      win_rate          REAL    NOT NULL,
      pick_rate         REAL    NOT NULL,
      ban_rate          REAL    NOT NULL,
      avg_damage        REAL    NOT NULL,
      avg_gold          REAL    NOT NULL,
      avg_cs            REAL    NOT NULL,
      avg_kda           REAL    NOT NULL,
      tier_pick_rate    REAL    NOT NULL,
      tier_stdevs       REAL    NOT NULL,
      last_updated_at   TEXT    NULL,
      queue_total_match INTEGER NOT NULL,
      PRIMARY KEY (champion_id, role)
    )
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS worst_matchups (
      champion_id   TEXT NOT NULL,
      role          TEXT NOT NULL,
      patch         TEXT NOT NULL DEFAULT 'unknown',
      opp_champion  INTEGER NOT NULL,
      wins          INTEGER NOT NULL,
      matches       INTEGER NOT NULL,
      win_rate      REAL NOT NULL,
      opp_win_rate  REAL NOT NULL,
      PRIMARY KEY (champion_id, role, opp_champion)
    )
  `);
}

/**
 * Check if data is stale and needs refresh
 */
async function isStatsDataStale(): Promise<boolean> {
  return isDataStale({
    tableName: 'champion_stats',
    thresholdMs: STALE_THRESHOLD_MS,
    logPrefix: 'Stats data',
  });
}

/**
 * Populate champion stats with batched operations (runs in background)
 */
export async function populateChampionStats() {
  const startTime = Date.now();
  
  try {
    // Check if refresh is needed
    if (!(await isStatsDataStale())) {
      console.log('✅ Champion stats are up to date, skipping refresh');
      return;
    }

    console.log('🔄 Fetching latest champion stats...');
    
    // Fetch + parse with dynamic URL generation
    const fetchResult = await fetchAndParse();
    const { parsed, patch, currentPatch, usedFallback } = fetchResult;
    const { data } = parsed;
    const lastUpdated = data.last_updated_at ?? null;
    const totalMatches = data.queue_type_total_matches;

    // Check if using fallback patch and if it matches current DB patch
    if (usedFallback) {
      const dbPatch = await getCurrentDbPatch();
      if (dbPatch === patch) {
        console.log(`✅ Fallback patch ${patch} matches current DB data, skipping update`);
        console.log(`   (No new data available for patch ${currentPatch})`);
        return;
      }
    }

    // Count totals for progress tracking
    let totalChampions = 0;
    let totalMatchups = 0;
    for (const champs of Object.values(data.win_rates)) {
      totalChampions += champs.length;
      for (const c of champs) {
        totalMatchups += c.worst_against.bad_against.length;
      }
    }

    console.log(`📈 Processing ${totalChampions} champions with ${totalMatchups} matchups across ${Object.keys(data.win_rates).length} roles...`);

    // Prepare SQL statements
    const upsertChampion = `
      INSERT INTO champion_stats (
        champion_id, role, patch, matches, win_rate, pick_rate, ban_rate,
        avg_damage, avg_gold, avg_cs, avg_kda, tier_pick_rate, tier_stdevs,
        last_updated_at, queue_total_match
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(champion_id, role) DO UPDATE SET
        patch = excluded.patch,
        matches = excluded.matches,
        win_rate = excluded.win_rate,
        pick_rate = excluded.pick_rate,
        ban_rate = excluded.ban_rate,
        avg_damage = excluded.avg_damage,
        avg_gold = excluded.avg_gold,
        avg_cs = excluded.avg_cs,
        avg_kda = excluded.avg_kda,
        tier_pick_rate = excluded.tier_pick_rate,
        tier_stdevs = excluded.tier_stdevs,
        last_updated_at = excluded.last_updated_at,
        queue_total_match = excluded.queue_total_match
    `;

    const upsertMatchup = `
      INSERT INTO worst_matchups (
        champion_id, role, patch, opp_champion, wins, matches, win_rate, opp_win_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(champion_id, role, opp_champion) DO UPDATE SET
        patch = excluded.patch,
        wins = excluded.wins,
        matches = excluded.matches,
        win_rate = excluded.win_rate,
        opp_win_rate = excluded.opp_win_rate
    `;

    // Build batch operations
    const championBatch: Array<{ sql: string; args: any[] }> = [];
    const matchupBatch: Array<{ sql: string; args: any[] }> = [];
    
    let processedChamps = 0;
    
    for (const [role, champs] of Object.entries(data.win_rates)) {
      for (const c of champs) {
        // Add champion upsert
        championBatch.push({
          sql: upsertChampion,
          args: [
            c.champion_id,
            role,
            patch,
            c.matches,
            c.win_rate,
            c.pick_rate,
            c.ban_rate,
            c.avg_damage,
            c.avg_gold,
            c.avg_cs,
            c.avg_kda,
            c.tier.pick_rate,
            c.tier.stdevs,
            lastUpdated,
            totalMatches,
          ],
        });

        // Add matchup upserts
        for (const w of c.worst_against.bad_against) {
          matchupBatch.push({
            sql: upsertMatchup,
            args: [
              c.champion_id,
              role,
              patch,
              w.champion_id,
              w.wins,
              w.matches,
              w.win_rate,
              w.opp_win_rate,
            ],
          });
        }
        
        processedChamps++;
        if (processedChamps % 50 === 0) {
          console.log(`  ⏳ Prepared ${processedChamps}/${totalChampions} champions...`);
        }
      }
    }

    console.log('💾 Writing to database...');
    
    // Execute in transaction with batching
    await turso.execute('BEGIN');
    try {
      // Batch champion inserts
      console.log(`  📊 Upserting ${championBatch.length} champion records...`);
      await turso.batch(championBatch, 'write');
      
      // Clear old matchups and insert new ones
      console.log(`  🥊 Clearing old matchups...`);
      await turso.execute('DELETE FROM worst_matchups');
      
      console.log(`  📊 Inserting ${matchupBatch.length} matchup records...`);
      await turso.batch(matchupBatch, 'write');
    
      
      const elapsed = formatDuration(Date.now() - startTime);
      console.log(`✅ Champion stats updated successfully in ${elapsed}`);
      console.log(`   └─ ${totalChampions} champions, ${totalMatchups} matchups`);
    } catch (err) {
      console.error('❌ Failed to update champion stats:', err);
      throw err;
    }
  } catch (err) {
    const elapsed = formatDuration(Date.now() - startTime);
    console.error(`❌ Champion stats migration failed after ${elapsed}:`, err);
    throw err;
  }
}