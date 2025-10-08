import { createSchema, populateChampionStats } from "./champion-stats";
import { createUserStatsSchema } from "./user-stats";
import { createChampionBuildsSchema, populateChampionBuilds, populateChampionAttributes } from "./champion-builds";

async function runMigrations() {
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

runMigrations();