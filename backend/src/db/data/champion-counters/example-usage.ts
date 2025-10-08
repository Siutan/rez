/**
 * Example usage of the champion counters parser
 * 
 * This demonstrates how to fetch and parse champion matchup data from u.gg
 */

import { parseChampionCounters, parseAllRoles } from './index';
import type { ChampionCountersRawData } from './index';

// Example: Fetch data from u.gg API
async function fetchChampionCounters(championId: number, patch: string = '15_19'): Promise<ChampionCountersRawData> {
  const url = `https://stats2.u.gg/lol/1.5/matchups/${patch}/ranked_solo_5x5/${championId}/1.5.0.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }
  return response.json();
}

// Example 1: Parse specific region/tier/role
async function example1() {
  console.log('=== Example 1: Parse specific region/tier/role ===\n');
  
  const championId = 134; // Syndra
  const rawData = await fetchChampionCounters(championId);
  
  // Parse world master+ mid lane data
  const midCounters = parseChampionCounters(rawData, 'world', 'master_plus', 'mid');
  
  if (midCounters) {
    console.log(`Total matches: ${midCounters.matches}`);
    console.log(`Champions analyzed: ${midCounters.counters.length}`);
    console.log(`Last updated: ${midCounters.last_updated}\n`);
    
    // Show top 5 counters by win rate
    const topCounters = [...midCounters.counters]
      .filter(c => c.matches >= 5) // At least 5 matches for reliability
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 5);
    
    console.log('Top 5 counters (by win rate, min 5 matches):');
    topCounters.forEach((counter, i) => {
      console.log(`  ${i + 1}. Champion ${counter.champion_id}: ${counter.win_rate}% WR (${counter.matches} matches)`);
      console.log(`     Gold advantage @ 15: ${counter.gold_adv_15}`);
      console.log(`     CS advantage @ 15: ${counter.cs_adv_15}`);
    });
  }
}

// Example 2: Parse all roles
async function example2() {
  console.log('\n=== Example 2: Parse all roles ===\n');
  
  const championId = 134; // Syndra
  const rawData = await fetchChampionCounters(championId);
  
  // Parse all roles at once
  const allRoles = parseAllRoles(rawData);
  
  for (const [roleName, roleData] of Object.entries(allRoles)) {
    if (roleData) {
      console.log(`${roleName}: ${roleData.counters.length} champions, ${roleData.matches} matches`);
    }
  }
}

// Example 3: Compare different tiers
async function example3() {
  console.log('\n=== Example 3: Compare different tiers ===\n');
  
  const championId = 134; // Syndra
  const rawData = await fetchChampionCounters(championId);
  
  const tiers = ['master_plus', 'diamond_plus', 'platinum_plus'];
  
  for (const tier of tiers) {
    const data = parseChampionCounters(rawData, 'world', tier, 'mid');
    if (data) {
      console.log(`${tier}: ${data.matches} matches`);
    }
  }
}

// Run examples
if (import.meta.main) {
  example1()
    .then(() => example2())
    .then(() => example3())
    .catch(console.error);
}

