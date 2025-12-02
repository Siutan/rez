import { createSchema, populateChampionStats } from "./champion-stats";
import { createUserStatsSchema } from "./user-champion-stats";
import { updateUserStatsSchema } from "./update-user-stats-schema";
import { createChampionBuildsSchema, populateChampionBuilds } from "./champion-builds";
import { createChampionCountersSchema, populateChampionCounters, populateMultipleChampionCounters } from "./champion-counters";
import { cleanupOldPatchData } from "./cleanup-old-patches";

async function runMigrations() {
  console.log('🔄 Running Migrations Sync');

  try {
    // Create schemas
    console.log('📋 Creating schemas...');
    await createSchema();
    await createUserStatsSchema();
    await updateUserStatsSchema(); // Update existing schema if needed
    await createChampionBuildsSchema();
    await createChampionCountersSchema();

    // Populate data
    console.log('📊 Populating data...');
    await populateChampionStats();
    await populateChampionBuilds();

    // Champion counters (optional - uncomment to populate)
    // Note: This fetches data from u.gg for each champion individually and can be slow.
    // The system auto-detects the current patch and only populates if:
    //   1. The patch is at least 1 week old (to ensure data quality)
    //   2. The patch hasn't been populated yet
    //
    // Example: Populate for a single champion (Syndra = 134)
    // await populateChampionCounters(134);
    //
    // Example: Populate for multiple champions (auto-detects patch)
    // await populateMultipleChampionCounters([134, 103, 86]);
    //
    // Example: Force populate for a specific patch (bypasses auto-detection)
    // await populateChampionCounters(134, '15_19');

    // Cleanup old patch data (only runs if everything above succeeded)
    await cleanupOldPatchData();

    console.log('✅ Migrations Sync Complete');
  } catch (err) {
    console.error('❌ Migrations Sync Failed:', err);
    process.exit(1);
  }
}

runMigrations();