import { turso } from '../turso';
import { fetchAndParse } from '../../services/data/champion-stats';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create database schema (runs synchronously before server starts)
 */
export async function createSchema() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS champion_stats (
      champion_id       TEXT    NOT NULL,
      role              TEXT    NOT NULL,
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
async function isDataStale(): Promise<boolean> {
  try {
    const result = await turso.execute(`
      SELECT last_updated_at FROM champion_stats LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return true; // No data exists
    }

    const lastUpdated = result.rows[0].last_updated_at as string | null;
    if (!lastUpdated) {
      return true;
    }

    const lastUpdatedTime = new Date(lastUpdated).getTime();
    const now = Date.now();
    const isStale = (now - lastUpdatedTime) > STALE_THRESHOLD_MS;
    
    if (!isStale) {
      console.log(`📊 Data is fresh (updated ${new Date(lastUpdated).toLocaleString()})`);
    }
    
    return isStale;
  } catch (err) {
    console.log('⚠️  Could not check data staleness, will refresh:', err);
    return true;
  }
}

/**
 * Populate champion stats with batched operations (runs in background)
 */
export async function populateChampionStats() {
  const startTime = Date.now();
  
  try {
    // Check if refresh is needed
    if (!(await isDataStale())) {
      console.log('✅ Champion stats are up to date, skipping refresh');
      return;
    }

    console.log('🔄 Fetching latest champion stats...');
    
    // Fetch + parse with dynamic URL generation
    const parsed = await fetchAndParse();
    const { data } = parsed;
    const lastUpdated = data.last_updated_at ?? null;
    const totalMatches = data.queue_type_total_matches;

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
        champion_id, role, matches, win_rate, pick_rate, ban_rate,
        avg_damage, avg_gold, avg_cs, avg_kda, tier_pick_rate, tier_stdevs,
        last_updated_at, queue_total_match
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(champion_id, role) DO UPDATE SET
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
        champion_id, role, opp_champion, wins, matches, win_rate, opp_win_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(champion_id, role, opp_champion) DO UPDATE SET
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
      
      await turso.execute('COMMIT');
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Champion stats updated successfully in ${elapsed}s`);
      console.log(`   └─ ${totalChampions} champions, ${totalMatchups} matchups`);
    } catch (err) {
      await turso.execute('ROLLBACK');
      console.error('❌ Failed to update champion stats:', err);
      throw err;
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ Champion stats migration failed after ${elapsed}s:`, err);
    throw err;
  }
}