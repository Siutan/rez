import type { ChampionCounter, ChampionCountersData, ChampionCountersRawData } from './types';

/**
 * Region keys mapping
 * Based on analysis of u.gg data structure:
 * 1-18 map to different regions
 * Key 12 = "world"
 */
const REGION_KEY_MAP: Record<number, string> = {
  1: 'na1',
  2: 'euw1',
  3: 'kr',
  4: 'eun1',
  5: 'br1',
  6: 'la1',
  7: 'la2',
  8: 'oc1',
  9: 'ru',
  10: 'tr1',
  11: 'jp1',
  12: 'world',
  13: 'ph2',
  14: 'sg2',
  15: 'th2',
  16: 'tw2',
  17: 'vn2',
  18: 'me1'
};

/**
 * Tier keys mapping
 * Based on analysis, key 14 = "master_plus"
 */
const TIER_KEY_MAP: Record<number, string> = {
  1: 'challenger',
  2: 'grandmaster',
  3: 'master',
  4: 'diamond',
  5: 'platinum',
  6: 'gold',
  7: 'silver',
  8: 'bronze',
  10: 'diamond_plus',
  11: 'platinum_plus',
  12: 'emerald',
  13: 'iron',
  14: 'master_plus',
  15: 'diamond_2_plus',
  16: 'emerald_plus',
  17: 'overall'
};

/**
 * Role keys mapping
 * 1 = jungle, 2 = support, 3 = adc, 4 = top, 5 = mid
 */
const ROLE_KEY_MAP: Record<number, string> = {
  1: 'jungle',
  2: 'support',
  3: 'adc',
  4: 'top',
  5: 'mid'
};

/**
 * Parse a single champion counter entry from raw data array
 */
function parseChampionCounter(
  rawData: number[],
  totalMatches: number
): ChampionCounter {
  const [
    champion_id,
    losses,
    matches,
    negXpAdv,
    negGoldAdv,
    duoGoldAdv,
    negCsAdv,
    duoCsAdv,
    negJungleCsAdv,
    negKillAdv,
    duoKillAdv,
    duoXpAdv,
    negCarryPct,
    duoCarryPct,
    negTeamGoldDiff
  ] = rawData;

  // Calculate win rate: (matches - losses) / matches * 100
  const win_rate = matches > 0 ? ((matches - losses) / matches) * 100 : 0;
  
  // Calculate pick rate: matches / totalMatches * 100
  const pick_rate = totalMatches > 0 ? (matches / totalMatches) * 100 : 0;

  // Parse advantages (invert and divide by matches to get averages)
  const xp_adv_15 = matches > 0 ? -negXpAdv / matches : 0;
  const gold_adv_15 = matches > 0 ? -negGoldAdv / matches : 0;
  const duo_gold_adv_15 = matches > 0 ? duoGoldAdv / matches : 0;
  const cs_adv_15 = matches > 0 ? -negCsAdv / matches : 0;
  const duo_cs_adv_15 = matches > 0 ? duoCsAdv / matches : 0;
  const jungle_cs_adv_15 = matches > 0 ? -negJungleCsAdv / matches : 0;
  const kill_adv_15 = matches > 0 ? -negKillAdv / matches : 0;
  const duo_kill_adv_15 = matches > 0 ? duoKillAdv / matches : 0;
  const duo_xp_adv_15 = matches > 0 ? duoXpAdv / matches : 0;
  
  // Carry percentage needs to be inverted, divided by matches, then multiplied by 10
  const carry_percentage_15 = matches > 0 ? (-negCarryPct / matches) * 10 : 0;
  const duo_carry_percentage_15 = matches > 0 ? (duoCarryPct / matches) * 10 : 0;
  
  const team_gold_difference_15 = matches > 0 ? -negTeamGoldDiff / matches : 0;

  return {
    champion_id,
    win_rate: parseFloat(win_rate.toFixed(2)),
    pick_rate: parseFloat(pick_rate.toFixed(2)),
    tier: {
      pick_rate: parseFloat(pick_rate.toFixed(2)),
      win_rate: parseFloat(win_rate.toFixed(2))
    },
    matches,
    // These fields are rounded to integers in u.gg data
    xp_adv_15: Math.round(xp_adv_15),
    gold_adv_15: Math.round(gold_adv_15),
    duo_gold_adv_15: Math.round(duo_gold_adv_15),
    // These fields keep decimals (rounded to 1 decimal place)
    cs_adv_15: Math.round(cs_adv_15 * 10) / 10,
    duo_cs_adv_15: Math.round(duo_cs_adv_15 * 10) / 10,
    jungle_cs_adv_15: Math.round(jungle_cs_adv_15 * 10) / 10,
    kill_adv_15: Math.round(kill_adv_15 * 100) / 100,
    duo_kill_adv_15: Math.round(duo_kill_adv_15 * 100) / 100,
    duo_xp_adv_15: Math.round(duo_xp_adv_15 * 100) / 100,
    // These fields are rounded to integers in u.gg data
    carry_percentage_15: Math.round(carry_percentage_15),
    duo_carry_percentage_15: Math.round(duo_carry_percentage_15),
    team_gold_difference_15: Math.round(team_gold_difference_15)
  };
}

/**
 * Parse champion counters data for a specific region, tier, and role
 */
export function parseChampionCounters(
  rawData: ChampionCountersRawData,
  region: string = 'world',
  tier: string = 'master_plus',
  role: string = 'mid'
): ChampionCountersData | null {
  // Find the region key
  const regionKey = Object.entries(REGION_KEY_MAP).find(
    ([_, value]) => value === region
  )?.[0];
  
  if (!regionKey || !rawData[regionKey]) {
    console.warn(`Region "${region}" not found in raw data`);
    return null;
  }

  // Find the tier key
  const tierKey = Object.entries(TIER_KEY_MAP).find(
    ([_, value]) => value === tier
  )?.[0];
  
  if (!tierKey || !rawData[regionKey][tierKey]) {
    console.warn(`Tier "${tier}" not found in region "${region}"`);
    return null;
  }

  // Find the role key
  const roleKey = Object.entries(ROLE_KEY_MAP).find(
    ([_, value]) => value === role
  )?.[0];
  
  if (!roleKey || !rawData[regionKey][tierKey][roleKey]) {
    console.warn(`Role "${role}" not found in tier "${tier}" for region "${region}"`);
    return null;
  }

  const [championDataArray, timestamp] = rawData[regionKey][tierKey][roleKey];
  
  if (!Array.isArray(championDataArray) || championDataArray.length === 0) {
    return {
      counters: [],
      last_updated: typeof timestamp === 'string' ? timestamp : new Date().toISOString(),
      matches: 0
    };
  }

  // Calculate total matches
  const totalMatches = championDataArray.reduce((sum, entry) => sum + entry[2], 0);

  // Parse each champion counter
  const counters = championDataArray.map(entry => 
    parseChampionCounter(entry, totalMatches)
  );

  return {
    counters,
    last_updated: typeof timestamp === 'string' ? timestamp : new Date().toISOString(),
    matches: totalMatches
  };
}

/**
 * Parse all champion counters for world_master_plus with different roles
 */
export function parseAllRoles(
  rawData: ChampionCountersRawData
): Record<string, ChampionCountersData | null> {
  const roles = ['jungle', 'support', 'adc', 'top', 'mid'];
  const result: Record<string, ChampionCountersData | null> = {};
  
  for (const role of roles) {
    const key = `world_master_plus_${role}`;
    result[key] = parseChampionCounters(rawData, 'world', 'master_plus', role);
  }
  
  return result;
}

