import { turso } from '../turso';
import { fetchAllChampionBuilds } from '../data/champion-builds';
import { buildAIPrompt } from '../data/champion-builds/parser';
import { batchClassifyChampions, isAIServiceAvailable } from '../../services/ai/champion-classifier';
import type { ChampionBuild, ChampionAttributes } from '../data/champion-builds/types';
import {
  isDataStale,
  getCurrentTimestamp,
  formatDuration,
  TIME_CONSTANTS,
} from './utils';

const STALE_THRESHOLD_MS = TIME_CONSTANTS.ONE_WEEK;

/**
 * Get the current patch stored in the database
 */
async function getCurrentDbPatch(): Promise<string | null> {
  try {
    const result = await turso.execute(`
      SELECT patch FROM champion_builds 
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
 * Create database schema for champion builds and AI attributes
 */
export async function createChampionBuildsSchema() {
  // Champion builds table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS champion_builds (
      champion_id       TEXT    NOT NULL, -- Numeric key (e.g., "103")
      champion_key      TEXT    NOT NULL, -- DDragon string ID (e.g., "Ahri")
      champion_name     TEXT    NOT NULL, -- Display name
      role              TEXT    NOT NULL,
      patch             TEXT    NOT NULL,
      mythic_items      TEXT    NOT NULL, -- JSON array of item IDs
      core_items        TEXT    NOT NULL, -- JSON array of item IDs
      starting_items    TEXT    NOT NULL, -- JSON array of item IDs
      boots             INTEGER NULL,     -- item ID
      mythic_names      TEXT    NOT NULL, -- JSON array of item names
      core_names        TEXT    NOT NULL, -- JSON array of item names
      starting_names    TEXT    NOT NULL, -- JSON array of item names
      boots_name        TEXT    NULL,     -- item name
      skill_order       TEXT    NOT NULL, -- JSON array
      primary_runes     TEXT    NULL,     -- JSON object
      secondary_runes   TEXT    NULL,     -- JSON object
      shards            TEXT    NOT NULL, -- JSON array
      last_updated_at   TEXT    NOT NULL,
      PRIMARY KEY (champion_id, role, patch)
    )
  `);

  // Champion AI attributes table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS champion_attributes (
      champion_id       TEXT    NOT NULL, -- Numeric key (e.g., "103")
      champion_name     TEXT    NOT NULL, -- Display name
      role              TEXT    NOT NULL,
      patch             TEXT    NOT NULL,
      damage_ad         REAL    NOT NULL, -- 0-1
      damage_ap         REAL    NOT NULL, -- 0-1
      damage_true       REAL    NOT NULL, -- 0-1
      durability        REAL    NOT NULL, -- 0-1
      notes             TEXT    NOT NULL, -- JSON array of strings
      last_updated_at   TEXT    NOT NULL,
      PRIMARY KEY (champion_id, role, patch)
    )
  `);

  console.log('✅ Champion builds and attributes schema created');
}

/**
 * Check if build data is stale
 */
async function isBuildDataStale(): Promise<boolean> {
  return isDataStale({
    tableName: 'champion_builds',
    thresholdMs: STALE_THRESHOLD_MS,
    minRecordCount: 165,
    expectedRecordCount: 171,
    logPrefix: 'Build data',
  });
}

/**
 * Upsert a champion build
 */
function upsertChampionBuild(build: ChampionBuild, timestamp: string) {
  const sql = `
    INSERT INTO champion_builds (
      champion_id, champion_key, champion_name, role, patch,
      mythic_items, core_items, starting_items, boots,
      mythic_names, core_names, starting_names, boots_name,
      skill_order, primary_runes, secondary_runes, shards,
      last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(champion_id, role, patch) DO UPDATE SET
      champion_key = excluded.champion_key,
      champion_name = excluded.champion_name,
      mythic_items = excluded.mythic_items,
      core_items = excluded.core_items,
      starting_items = excluded.starting_items,
      boots = excluded.boots,
      mythic_names = excluded.mythic_names,
      core_names = excluded.core_names,
      starting_names = excluded.starting_names,
      boots_name = excluded.boots_name,
      skill_order = excluded.skill_order,
      primary_runes = excluded.primary_runes,
      secondary_runes = excluded.secondary_runes,
      shards = excluded.shards,
      last_updated_at = excluded.last_updated_at
  `;

  return {
    sql,
    args: [
      build.championId,
      build.championKey,
      build.championName,
      build.role,
      build.patch,
      JSON.stringify(build.items.mythic),
      JSON.stringify(build.items.core),
      JSON.stringify(build.items.starting),
      build.items.boots,
      JSON.stringify(build.itemNames.mythic),
      JSON.stringify(build.itemNames.core),
      JSON.stringify(build.itemNames.starting),
      build.itemNames.boots,
      JSON.stringify(build.skillOrder),
      JSON.stringify(build.runes.primary),
      JSON.stringify(build.runes.secondary),
      JSON.stringify(build.runes.shards),
      timestamp,
    ],
  };
}

/**
 * Populate champion builds (without AI classification)
 */
export async function populateChampionBuilds() {
  const startTime = Date.now();

  try {
    // Check if refresh is needed
    if (!(await isBuildDataStale())) {
      console.log('✅ Champion builds are up to date, skipping refresh');
      return;
    }

    console.log('🔄 Fetching champion builds...');

    const fetchResult = await fetchAllChampionBuilds();
    const { builds, version, patch, currentPatch, usedFallback } = fetchResult;
    const timestamp = getCurrentTimestamp();

    // Check if using fallback patch and if it matches current DB patch
    if (usedFallback) {
      const dbPatch = await getCurrentDbPatch();
      if (dbPatch === patch) {
        console.log(`✅ Fallback patch ${patch} matches current DB data, skipping update`);
        console.log(`   (No new data available for patch ${currentPatch})`);
        return;
      }
    }

    console.log(`📦 Processing ${builds.length} champion builds for patch ${patch}...`);

    // Build batch operations
    const buildBatch: Array<{ sql: string; args: any[] }> = [];

    for (const build of builds) {
      buildBatch.push(upsertChampionBuild(build, timestamp));
    }

    console.log('💾 Writing builds to database...');

    // Execute batch (batch operations are atomic in Turso)
    await turso.batch(buildBatch, 'write');

    const elapsed = formatDuration(Date.now() - startTime);
    console.log(`✅ Champion builds updated successfully in ${elapsed}`);
    console.log(`   └─ ${builds.length} builds for patch ${patch}`);
  } catch (err) {
    const elapsed = formatDuration(Date.now() - startTime);
    console.error(`❌ Champion builds migration failed after ${elapsed}:`, err);
    throw err;
  }
}

/**
 * Populate AI attributes for existing builds
 */
export async function populateChampionAttributes() {
  const startTime = Date.now();

  // Check if AI service is available
  if (!isAIServiceAvailable()) {
    console.log('⚠️  AI service not configured (GEMINI_ENDPOINT/GEMINI_API_KEY missing)');
    console.log('   Skipping AI classification. Set these env vars to enable.');
    return;
  }

  try {
    console.log('🤖 Starting AI classification of champions...');

    // Get all builds that don't have attributes yet
    const buildsResult = await turso.execute(`
      SELECT DISTINCT b.champion_id, b.champion_name, b.role, b.patch,
             b.mythic_names, b.core_names
      FROM champion_builds b
      LEFT JOIN champion_attributes a 
        ON b.champion_id = a.champion_id 
        AND b.role = a.role 
        AND b.patch = a.patch
      WHERE a.champion_id IS NULL
      ORDER BY b.champion_name
    `);

    if (buildsResult.rows.length === 0) {
      console.log('✅ All builds already have AI attributes');
      return;
    }

    console.log(`🤖 Found ${buildsResult.rows.length} champions needing classification`);

    // Fetch champion data for prompts
    const { version } = await fetchAllChampionBuilds();
    
    // For now, we'll need to re-fetch champion data
    // In production, you might want to cache this
    const { getChampionList } = await import('../data/champion-builds');
    const championList = await getChampionList(version);

    // Build prompts
    const prompts = buildsResult.rows.map(row => {
      const championId = row.champion_id as string;  // This is now the numeric key
      const championKey = row.champion_key as string; // This is the DDragon string ID
      const role = row.role as string;
      const mythicNames = JSON.parse(row.mythic_names as string);
      const coreNames = JSON.parse(row.core_names as string);
      
      // Find champion by key (numeric)
      const champion = Object.values(championList).find(c => c.key === championId);
      if (!champion) {
        throw new Error(`Champion with key ${championId} not found in DDragon data`);
      }

      return buildAIPrompt(champion, {
        championId,           // Numeric key
        championKey,          // DDragon string ID
        championName: champion.name,
        role,
        patch: row.patch as string,
        items: { mythic: [], core: [], starting: [], boots: null },
        itemNames: { mythic: mythicNames, core: coreNames, starting: [], boots: null },
        skillOrder: [],
        runes: { primary: null, secondary: null, shards: [] },
      });
    });

    // Batch classify with rate limiting (writes to DB per batch automatically)
    const attributes = await batchClassifyChampions(prompts, buildsResult.rows[0].patch as string, {
      maxRetries: 3,
    });

    const elapsed = formatDuration(Date.now() - startTime);
    console.log(`✅ AI attributes updated successfully in ${elapsed}`);
    console.log(`   └─ ${attributes.length} champions classified and written to database`);
  } catch (err) {
    const elapsed = formatDuration(Date.now() - startTime);
    console.error(`❌ AI classification failed after ${elapsed}:`, err);
    throw err;
  }
}


/**
 * Get champion build from database
 */
export async function getChampionBuild(championId: string, role: string, patch?: string) {
  const sql = patch
    ? `SELECT * FROM champion_builds WHERE champion_id = ? AND role = ? AND patch = ?`
    : `SELECT * FROM champion_builds WHERE champion_id = ? AND role = ? ORDER BY patch DESC LIMIT 1`;

  const args = patch ? [championId, role, patch] : [championId, role];

  const result = await turso.execute({ sql, args });
  return result.rows[0] || null;
}

/**
 * Get champion attributes from database
 */
export async function getChampionAttributes(championId: string, role: string, patch?: string) {
  const sql = patch
    ? `SELECT * FROM champion_attributes WHERE champion_id = ? AND role = ? AND patch = ?`
    : `SELECT * FROM champion_attributes WHERE champion_id = ? AND role = ? ORDER BY patch DESC LIMIT 1`;

  const args = patch ? [championId, role, patch] : [championId, role];

  const result = await turso.execute({ sql, args });
  return result.rows[0] || null;
}

/**
 * Get all builds for current patch
 */
export async function getAllBuildsForPatch(patch: string) {
  const result = await turso.execute({
    sql: `SELECT * FROM champion_builds WHERE patch = ? ORDER BY champion_name`,
    args: [patch],
  });
  return result.rows;
}

