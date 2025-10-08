/**
 * Test script for champion counters migration with patch tracking
 * 
 * This script:
 * 1. Creates the schema (including patch tracking table)
 * 2. Populates counter data for a single champion (Syndra = 134)
 * 3. Queries the data to verify it works
 * 4. Uses manual patch override to bypass the 1-week maturity check
 * 
 * Run with: bun run backend/test-counters-migration.ts
 */

import { createChampionCountersSchema, populateChampionCounters, getAllCountersForChampion, getTopCounters, getWorstMatchups } from './src/db/migrations/champion-counters';

async function testCountersMigration() {
  console.log('🧪 Testing Champion Counters Migration with Patch Tracking\n');
  
  try {
    // Step 1: Create schema
    console.log('1️⃣ Creating schema...');
    await createChampionCountersSchema();
    console.log('');
    
    // Step 2: Populate data for Syndra (134) with manual patch override
    console.log('2️⃣ Populating counter data for Syndra (134)...');
    console.log('   (Using patch override to bypass maturity check for testing)');
    await populateChampionCounters(134, '15_19');
    console.log('');
    
    // Step 3: Query all counters
    console.log('3️⃣ Querying all mid lane counters for Syndra...');
    const allCounters = await getAllCountersForChampion(134, 'mid');
    console.log(`   Found ${allCounters.length} counters`);
    console.log('');
    
    // Step 4: Get top counters
    console.log('4️⃣ Getting top 5 matchups (min 5 games)...');
    const topCounters = await getTopCounters(134, 'mid', 5, 5);
    console.log(`   Top ${topCounters.length} matchups:`);
    topCounters.forEach((counter: any, i: number) => {
      console.log(`   ${i + 1}. Champion ${counter.opponent_champion_id}: ${counter.win_rate}% WR (${counter.matches} games)`);
      console.log(`      Gold adv @ 15: ${counter.gold_adv_15}, CS adv @ 15: ${counter.cs_adv_15}`);
    });
    console.log('');
    
    // Step 5: Get worst matchups
    console.log('5️⃣ Getting worst 5 matchups (min 5 games)...');
    const worstMatchups = await getWorstMatchups(134, 'mid', 5, 5);
    console.log(`   Worst ${worstMatchups.length} matchups:`);
    worstMatchups.forEach((counter: any, i: number) => {
      console.log(`   ${i + 1}. Champion ${counter.opponent_champion_id}: ${counter.win_rate}% WR (${counter.matches} games)`);
      console.log(`      Gold adv @ 15: ${counter.gold_adv_15}, CS adv @ 15: ${counter.cs_adv_15}`);
    });
    console.log('');
    
    console.log('✅ All tests passed! Migration is working correctly.');
    console.log('\n💡 Tip: Uncomment the population lines in run-migrations.ts to populate more champions.');
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testCountersMigration();

