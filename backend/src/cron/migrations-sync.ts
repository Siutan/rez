import { cron } from '@elysiajs/cron';
import { Patterns } from '@elysiajs/cron';
import { createSchema, populateChampionStats } from "../db/migrations/champion-stats";
import { createUserStatsSchema } from "../db/migrations/user-stats";
import { createChampionBuildsSchema, populateChampionBuilds, populateChampionAttributes } from "../db/migrations/champion-builds";


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
        
        // Populate data
        console.log('📊 Populating data...');
        await populateChampionStats();
        await populateChampionBuilds();
        
        // AI classification (runs only if new builds exist and AI is configured)
        console.log('🤖 Running AI classification...');
        await populateChampionAttributes();
        
        console.log('✅ Migrations Sync Complete')
    }
})