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

        // Champion counters:
        // commented out because each champion takes a long time to populate and theres like 170 of them
        // figure this out later when we have a better way to populate them
        // await autoPopulateCountersIfNeeded([134, 103, 86]);

        console.log('✅ Migrations Sync Complete')
    }
})