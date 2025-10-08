import { turso } from '../turso';
import {
  getCurrentPatch,
  versionToPatch,
  getCurrentTimestamp,
  formatDuration,
  isOlderThan,
  sleep,
  RateLimiter,
  TIME_CONSTANTS,
} from './utils';

const PATCH_MATURITY_MS = TIME_CONSTANTS.ONE_WEEK;

/**
 * Create database schema for champion counters and patch tracking
 */
export async function createChampionCountersSchema() {
  // Champion counters table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS champion_counters (
      champion_id               INTEGER NOT NULL,
      opponent_champion_id      INTEGER NOT NULL,
      region                    TEXT    NOT NULL,
      tier                      TEXT    NOT NULL,
      role                      TEXT    NOT NULL,
      patch                     TEXT    NOT NULL,
      win_rate                  REAL    NOT NULL,
      pick_rate                 REAL    NOT NULL,
      tier_pick_rate            REAL    NOT NULL,
      tier_win_rate             REAL    NOT NULL,
      matches                   INTEGER NOT NULL,
      xp_adv_15                 INTEGER NOT NULL,
      gold_adv_15               INTEGER NOT NULL,
      duo_gold_adv_15           INTEGER NOT NULL,
      cs_adv_15                 REAL    NOT NULL,
      duo_cs_adv_15             REAL    NOT NULL,
      jungle_cs_adv_15          REAL    NOT NULL,
      kill_adv_15               REAL    NOT NULL,
      duo_kill_adv_15           REAL    NOT NULL,
      duo_xp_adv_15             REAL    NOT NULL,
      carry_percentage_15       INTEGER NOT NULL,
      duo_carry_percentage_15   INTEGER NOT NULL,
      team_gold_difference_15   INTEGER NOT NULL,
      last_updated_at           TEXT    NOT NULL,
      total_matches             INTEGER NOT NULL,
      PRIMARY KEY (champion_id, opponent_champion_id, region, tier, role, patch)
    )
  `);

  // Patch tracking table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS counter_patches (
      patch               TEXT    NOT NULL PRIMARY KEY,
      patch_version       TEXT    NOT NULL,
      discovered_at       TEXT    NOT NULL,
      last_checked_at     TEXT    NULL,
      data_populated      INTEGER NOT NULL DEFAULT 0,
      champions_processed INTEGER NOT NULL DEFAULT 0,
      total_counters      INTEGER NOT NULL DEFAULT 0
    )
  `);

  console.log('✅ Champion counters and patch tracking schema created');
}


/**
 * Get or create patch record
 */
async function getOrCreatePatch(patch: string, patchVersion: string) {
  // Check if patch exists
  const existing = await turso.execute({
    sql: 'SELECT * FROM counter_patches WHERE patch = ?',
    args: [patch],
  });

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new patch record
  const now = getCurrentTimestamp();
  await turso.execute({
    sql: `
      INSERT INTO counter_patches (patch, patch_version, discovered_at, data_populated)
      VALUES (?, ?, ?, 0)
    `,
    args: [patch, patchVersion, now],
  });

  console.log(`📋 Registered new patch: ${patchVersion} (${patch})`);

  return {
    patch,
    patch_version: patchVersion,
    discovered_at: now,
    last_checked_at: null,
    data_populated: 0,
    champions_processed: 0,
    total_counters: 0,
  };
}

/**
 * Check if a patch is mature enough to have reliable data
 */
function isPatchMature(discoveredAt: string): boolean {
  return isOlderThan(discoveredAt, PATCH_MATURITY_MS);
}

/**
 * Check if counter data needs to be populated for current patch
 */
async function shouldPopulateCounters(): Promise<{ shouldPopulate: boolean; patch: string; patchVersion: string }> {
  try {
    // Get current game version from DDragon
    const { patch, version: currentVersion } = await getCurrentPatch();

    // Get or create patch record
    const patchRecord = await getOrCreatePatch(patch, currentVersion);

    // If data already populated, no need to refresh
    if (patchRecord.data_populated === 1) {
      console.log(`✅ Counter data already populated for patch ${currentVersion}`);
      return { shouldPopulate: false, patch, patchVersion: currentVersion };
    }

    // Check if patch is mature (at least 1 week old)
    if (!isPatchMature(patchRecord.discovered_at as string)) {
      const discoveredDate = new Date(patchRecord.discovered_at as string);
      const maturityDate = new Date(discoveredDate.getTime() + PATCH_MATURITY_MS);
      console.log(`⏳ Patch ${currentVersion} is too new. Data will be available after ${maturityDate.toLocaleString()}`);
      return { shouldPopulate: false, patch, patchVersion: currentVersion };
    }

    // Patch is mature and not populated yet
    console.log(`🔄 Patch ${currentVersion} is mature and ready for data population`);
    return { shouldPopulate: true, patch, patchVersion: currentVersion };
  } catch (err) {
    console.error('⚠️  Could not check patch status:', err);
    // Default to not populating on error
    return { shouldPopulate: false, patch: '', patchVersion: '' };
  }
}

/**
 * Mark patch as populated
 */
async function markPatchAsPopulated(patch: string, championsProcessed: number, totalCounters: number) {
  await turso.execute({
    sql: `
      UPDATE counter_patches 
      SET data_populated = 1, 
          last_checked_at = ?,
          champions_processed = ?,
          total_counters = ?
      WHERE patch = ?
    `,
    args: [getCurrentTimestamp(), championsProcessed, totalCounters, patch],
  });
  console.log(`✅ Marked patch ${patch} as populated`);
}

/**
 * Update last checked time for a patch
 */
async function updatePatchCheckTime(patch: string) {
  await turso.execute({
    sql: 'UPDATE counter_patches SET last_checked_at = ? WHERE patch = ?',
    args: [getCurrentTimestamp(), patch],
  });
}

/**
 * Fetch champion counters from u.gg API
 */
async function fetchChampionCounters(championId: number, patch: string): Promise<any> {
  const url = `https://stats2.u.gg/lol/1.5/matchups/${patch}/ranked_solo_5x5/${championId}/1.5.0.json`;
  
  console.log(`🔄 Fetching counter data for champion ${championId} from u.gg...`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch counter data for champion ${championId}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Populate champion counters for a specific champion (uses current patch)
 */
export async function populateChampionCounters(championId: number, patchOverride?: string) {
  const startTime = Date.now();

  try {
    // Determine which patch to use
    let patch: string;
    let patchVersion: string;

    if (patchOverride) {
      // Manual override for testing or specific patch
      patch = patchOverride;
      patchVersion = patchOverride.replace('_', '.');
      console.log(`🔧 Using manual patch override: ${patchVersion}`);
    } else {
      // Check if we should populate based on current patch status
      const patchCheck = await shouldPopulateCounters();
      
      if (!patchCheck.shouldPopulate) {
        return; // shouldPopulateCounters already logs the reason
      }

      patch = patchCheck.patch;
      patchVersion = patchCheck.patchVersion;
    }

    // Fetch raw data
    const rawData = await fetchChampionCounters(championId, patch);
    const timestamp = getCurrentTimestamp();

    // Parse data for world_master_plus only
    const { parseAllRoles } = await import('../data/champion-counters');
    const parsedRoles = parseAllRoles(rawData);

    // Prepare batch operations
    const batch: Array<{ sql: string; args: any[] }> = [];
    let totalCounters = 0;

    const upsertSql = `
      INSERT INTO champion_counters (
        champion_id, opponent_champion_id, region, tier, role, patch,
        win_rate, pick_rate, tier_pick_rate, tier_win_rate, matches,
        xp_adv_15, gold_adv_15, duo_gold_adv_15, cs_adv_15, duo_cs_adv_15,
        jungle_cs_adv_15, kill_adv_15, duo_kill_adv_15, duo_xp_adv_15,
        carry_percentage_15, duo_carry_percentage_15, team_gold_difference_15,
        last_updated_at, total_matches
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(champion_id, opponent_champion_id, region, tier, role, patch) DO UPDATE SET
        win_rate = excluded.win_rate,
        pick_rate = excluded.pick_rate,
        tier_pick_rate = excluded.tier_pick_rate,
        tier_win_rate = excluded.tier_win_rate,
        matches = excluded.matches,
        xp_adv_15 = excluded.xp_adv_15,
        gold_adv_15 = excluded.gold_adv_15,
        duo_gold_adv_15 = excluded.duo_gold_adv_15,
        cs_adv_15 = excluded.cs_adv_15,
        duo_cs_adv_15 = excluded.duo_cs_adv_15,
        jungle_cs_adv_15 = excluded.jungle_cs_adv_15,
        kill_adv_15 = excluded.kill_adv_15,
        duo_kill_adv_15 = excluded.duo_kill_adv_15,
        duo_xp_adv_15 = excluded.duo_xp_adv_15,
        carry_percentage_15 = excluded.carry_percentage_15,
        duo_carry_percentage_15 = excluded.duo_carry_percentage_15,
        team_gold_difference_15 = excluded.team_gold_difference_15,
        last_updated_at = excluded.last_updated_at,
        total_matches = excluded.total_matches
    `;

    // Process each role
    for (const [roleKey, roleData] of Object.entries(parsedRoles)) {
      if (!roleData || !roleData.counters || roleData.counters.length === 0) {
        continue;
      }

      // Extract role from key (e.g., "world_master_plus_mid" -> "mid")
      const role = roleKey.split('_').pop() || 'mid';

      for (const counter of roleData.counters) {
        batch.push({
          sql: upsertSql,
          args: [
            championId,
            counter.champion_id,
            'world',
            'master_plus',
            role,
            patch,
            counter.win_rate,
            counter.pick_rate,
            counter.tier.pick_rate,
            counter.tier.win_rate,
            counter.matches,
            counter.xp_adv_15,
            counter.gold_adv_15,
            counter.duo_gold_adv_15,
            counter.cs_adv_15,
            counter.duo_cs_adv_15,
            counter.jungle_cs_adv_15,
            counter.kill_adv_15,
            counter.duo_kill_adv_15,
            counter.duo_xp_adv_15,
            counter.carry_percentage_15,
            counter.duo_carry_percentage_15,
            counter.team_gold_difference_15,
            timestamp,
            roleData.matches,
          ],
        });
        totalCounters++;
      }
    }

    if (batch.length === 0) {
      console.log(`⚠️  No counter data found for champion ${championId}`);
      return totalCounters;
    }

    console.log(`💾 Writing ${totalCounters} counter records for champion ${championId} (patch ${patchVersion})...`);

    // Execute batch
    await turso.batch(batch, 'write');

    const elapsed = formatDuration(Date.now() - startTime);
    console.log(`✅ Counter data for champion ${championId} updated successfully in ${elapsed}`);
    console.log(`   └─ ${totalCounters} counters across ${Object.keys(parsedRoles).length} roles`);

    return totalCounters;
  } catch (err) {
    const elapsed = formatDuration(Date.now() - startTime);
    console.error(`❌ Counter data migration failed for champion ${championId} after ${elapsed}:`, err);
    throw err;
  }
}

/**
 * Populate counters for multiple champions (uses current patch)
 */
export async function populateMultipleChampionCounters(championIds: number[], patchOverride?: string) {
  console.log(`🔄 Starting counter data migration for ${championIds.length} champions...`);
  const startTime = Date.now();

  // Check if we should populate
  let patch: string;
  let patchVersion: string;

  if (patchOverride) {
    patch = patchOverride;
    patchVersion = patchOverride.replace('_', '.');
    console.log(`🔧 Using manual patch override: ${patchVersion}`);
  } else {
    const patchCheck = await shouldPopulateCounters();
    
    if (!patchCheck.shouldPopulate) {
      console.log('⏭️  Skipping counter population');
      return;
    }

    patch = patchCheck.patch;
    patchVersion = patchCheck.patchVersion;
  }

  let successCount = 0;
  let errorCount = 0;
  let totalCountersAdded = 0;
  const rateLimiter = new RateLimiter(500); // 500ms between requests

  for (let i = 0; i < championIds.length; i++) {
    const championId = championIds[i];
    console.log(`\n[${i + 1}/${championIds.length}] Processing champion ${championId}...`);

    try {
      const countersAdded = await rateLimiter.execute(() => 
        populateChampionCounters(championId, patch)
      );
      totalCountersAdded += countersAdded || 0;
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to process champion ${championId}:`, err);
      errorCount++;
      // Continue with next champion
    }
  }

  // Mark patch as populated if all champions processed successfully
  if (!patchOverride && successCount > 0) {
    await markPatchAsPopulated(patch, successCount, totalCountersAdded);
  }

  const elapsed = formatDuration(Date.now() - startTime);
  console.log(`\n✅ Counter data migration complete in ${elapsed}`);
  console.log(`   └─ Success: ${successCount}, Errors: ${errorCount}, Total counters: ${totalCountersAdded}`);
}

/**
 * Auto-populate counters for mature patches (for use in cron jobs)
 * This checks the current patch and populates if it's mature and not yet populated
 */
export async function autoPopulateCountersIfNeeded(championIds: number[]) {
  console.log('🔍 Checking if counter data needs population...');
  
  const patchCheck = await shouldPopulateCounters();
  
  if (!patchCheck.shouldPopulate) {
    await updatePatchCheckTime(patchCheck.patch || '');
    return;
  }

  console.log(`🚀 Auto-populating counters for patch ${patchCheck.patchVersion}...`);
  await populateMultipleChampionCounters(championIds);
}

/**
 * Get counter data for a champion against a specific opponent
 */
export async function getChampionCounter(
  championId: number,
  opponentChampionId: number,
  role: string,
  region: string = 'world',
  tier: string = 'master_plus',
  patch?: string,
) {
  const sql = patch
    ? `
      SELECT * FROM champion_counters 
      WHERE champion_id = ? AND opponent_champion_id = ? AND role = ? AND region = ? AND tier = ? AND patch = ?
    `
    : `
      SELECT * FROM champion_counters 
      WHERE champion_id = ? AND opponent_champion_id = ? AND role = ? AND region = ? AND tier = ?
      ORDER BY patch DESC LIMIT 1
    `;

  const args = patch
    ? [championId, opponentChampionId, role, region, tier, patch]
    : [championId, opponentChampionId, role, region, tier];

  const result = await turso.execute({ sql, args });
  return result.rows[0] || null;
}

/**
 * Get all counters for a champion in a specific role
 */
export async function getAllCountersForChampion(
  championId: number,
  role: string,
  region: string = 'world',
  tier: string = 'master_plus',
  patch?: string,
) {
  const sql = patch
    ? `
      SELECT * FROM champion_counters 
      WHERE champion_id = ? AND role = ? AND region = ? AND tier = ? AND patch = ?
      ORDER BY win_rate DESC
    `
    : `
      SELECT * FROM champion_counters 
      WHERE champion_id = ? AND role = ? AND region = ? AND tier = ?
      ORDER BY patch DESC, win_rate DESC
    `;

  const args = patch ? [championId, role, region, tier, patch] : [championId, role, region, tier];

  const result = await turso.execute({ sql, args });
  return result.rows;
}

/**
 * Get top counters (best matchups) for a champion
 */
export async function getTopCounters(
  championId: number,
  role: string,
  limit: number = 10,
  minMatches: number = 5,
  region: string = 'world',
  tier: string = 'master_plus',
) {
  const sql = `
    SELECT * FROM champion_counters 
    WHERE champion_id = ? AND role = ? AND region = ? AND tier = ? AND matches >= ?
    ORDER BY patch DESC, win_rate DESC
    LIMIT ?
  `;

  const result = await turso.execute({
    sql,
    args: [championId, role, region, tier, minMatches, limit],
  });

  return result.rows;
}

/**
 * Get worst matchups (hardest counters) for a champion
 */
export async function getWorstMatchups(
  championId: number,
  role: string,
  limit: number = 10,
  minMatches: number = 5,
  region: string = 'world',
  tier: string = 'master_plus',
) {
  const sql = `
    SELECT * FROM champion_counters 
    WHERE champion_id = ? AND role = ? AND region = ? AND tier = ? AND matches >= ?
    ORDER BY patch DESC, win_rate ASC
    LIMIT ?
  `;

  const result = await turso.execute({
    sql,
    args: [championId, role, region, tier, minMatches, limit],
  });

  return result.rows;
}

