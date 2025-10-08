import { cron } from '@elysiajs/cron';
import { Patterns } from '@elysiajs/cron';
import { createSchema, populateChampionStats } from "../db/migrations/champion-stats";
import { createUserStatsSchema } from "../db/migrations/user-champion-stats";
import { createChampionBuildsSchema, populateChampionBuilds, populateChampionAttributes } from "../db/migrations/champion-builds";
import { createChampionCountersSchema, autoPopulateCountersIfNeeded } from "../db/migrations/champion-counters";

export const migrationsSync = cron({
    name: 'migrations-sync',
    pattern: Patterns.EVERY_WEEK,
    async run() {
        console.log('🔄 Running Migrations Sync')

        // Create schemas
        console.log('📋 Creating schemas...');
        await createSchema();
        await createUserStatsSchema();
        await createChampionBuildsSchema();
        await createChampionCountersSchema();

        // Populate data
        console.log('📊 Populating data...');
        await populateChampionStats();
        await populateChampionBuilds();

        // AI classification (runs only if new builds exist and AI is configured)
        console.log('🤖 Running AI classification...');
        await populateChampionAttributes();

        // Champion counters (optional - uncomment to enable auto-population)
        // This intelligently checks if:
        //   1. A new patch exists
        //   2. The patch is at least 1 week old (for data quality)
        //   3. Counter data hasn't been populated yet for this patch
        // If all conditions are met, it populates counter data automatically.
        //
        // Uncomment the line below and provide champion IDs to enable:
        // console.log('🎯 Checking champion counters...');
        // await autoPopulateCountersIfNeeded([134, 103, 86]); // Add your champion IDs

        console.log('✅ Migrations Sync Complete')
    }
})