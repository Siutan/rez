import type {
  UGGOverviewData,
  UGGBuildRecommendation,
  ChampionBuild,
  DDragonChampion,
  DDragonItem,
  AIClassificationPrompt,
  ROLE_INDEX_TO_NAME,
} from './types';

/**
 * Parse U.GG overview data for a specific champion and role
 * 
 * U.GG format (array of arrays):
 * [
 *   [0] = [type, count, primary_tree, secondary_tree, [rune_ids]]  // Runes
 *   [1] = [type, count, [summoner_spell_ids]]                      // Summoner spells
 *   [2] = [type, count, [item_ids]]                                // Starting items
 *   [3] = [type, count, [item_ids]]                                // Core items
 *   [4] = [type, count, [skill_order], priority]                   // Skills
 *   [5] = item builds (complex nested structure)
 *   [6] = [type, count]                                            // ?
 *   [7] = boolean                                                  // ?
 *   [8] = [type, count, [shard_ids]]                               // Stat shards
 * ]
 */
export function parseBuildData(
  champion: DDragonChampion,
  role: string,
  buildData: any,
  itemsData: Record<string, DDragonItem>,
  patch: string
): ChampionBuild {
  let mythicItems: number[] = [];
  let coreItems: number[] = [];
  let startingItems: number[] = [];
  let boots: number | null = null;
  let skillOrder: string[] = [];
  let primaryRunes = null;
  let secondaryRunes = null;
  let shards: number[] = [];
  
  if (buildData && Array.isArray(buildData) && buildData.length > 0) {
    // U.GG nested array format
    const mainBuild = buildData[0]; // First element contains the build
    
    if (Array.isArray(mainBuild)) {
      // Runes: [0] = [type, count, primary_tree, secondary_tree, [rune_ids]]
      if (mainBuild[0] && Array.isArray(mainBuild[0]) && mainBuild[0].length >= 5) {
        const runeData = mainBuild[0];
        const primaryTree = runeData[2];
        const secondaryTree = runeData[3];
        const runeIds = runeData[4] || [];
        
        primaryRunes = { tree: primaryTree, runes: runeIds.slice(0, 4) };
        secondaryRunes = { tree: secondaryTree, runes: runeIds.slice(4, 6) };
      }
      
      // Starting items: [2] = [type, count, [item_ids]]
      if (mainBuild[2] && Array.isArray(mainBuild[2]) && mainBuild[2][2]) {
        startingItems = mainBuild[2][2];
      }
      
      // Core items: [3] = [type, count, [item_ids]]
      if (mainBuild[3] && Array.isArray(mainBuild[3]) && mainBuild[3][2]) {
        coreItems = mainBuild[3][2];
        // Boots are usually in core items (item IDs 3xxx for boots)
        boots = coreItems.find((id: number) => id >= 3000 && id < 3200) || null;
      }
      
      // Skill order: [4] = [type, count, [skill_order], priority]
      if (mainBuild[4] && Array.isArray(mainBuild[4]) && mainBuild[4][2]) {
        skillOrder = mainBuild[4][2];
      }
      
      // Stat shards: [8] = [type, count, [shard_ids]]
      if (mainBuild[8] && Array.isArray(mainBuild[8]) && mainBuild[8][2]) {
        shards = mainBuild[8][2];
      }
    }
  }

  // Convert item IDs to names
  const getItemName = (itemId: number): string => {
    const item = itemsData[String(itemId)];
    return item?.name || `Item ${itemId}`;
  };

  return {
    championId: champion.key,        // Numeric key (e.g., "103")
    championKey: champion.id,        // DDragon string ID (e.g., "Ahri")
    championName: champion.name,     // Display name
    role,
    patch,
    items: {
      mythic: mythicItems,
      core: coreItems,
      starting: startingItems,
      boots,
    },
    itemNames: {
      mythic: mythicItems.map(getItemName),
      core: coreItems.map(getItemName),
      starting: startingItems.map(getItemName),
      boots: boots ? getItemName(boots) : null,
    },
    skillOrder,
    runes: {
      primary: primaryRunes,
      secondary: secondaryRunes,
      shards,
    },
  };
}

/**
 * Build AI classification prompt from champion data and build
 */
export function buildAIPrompt(
  champion: DDragonChampion,
  build: ChampionBuild
): AIClassificationPrompt {
  return {
    championId: champion.key,  // Use numeric key for consistency
    name: champion.name,
    tags: champion.tags,
    partype: champion.partype,
    stats: {
      attackdamage: champion.stats.attackdamage,
      attackdamageperlevel: champion.stats.attackdamageperlevel,
      armor: champion.stats.armor,
      hp: champion.stats.hp,
      mp: champion.stats.mp,
      attackspeed: champion.stats.attackspeed,
    },
    role: build.role,
    buildItems: [
      ...build.itemNames.mythic,
      ...build.itemNames.core,
    ],
  };
}

/**
 * Create the prompt text for the AI
 */
export function generatePromptText(prompt: AIClassificationPrompt): string {
  const promptText = `
You are given JSON describing a League of Legends champion's static data and its typical build for a role.
Produce a single JSON object with these fields:
{
  "champion_id": string,
  "role": string,
  "damage_distribution": { "ad": number, "ap": number, "true": number }, // sum to 1
  "durability": number, // 0.0 - 1.0
  "notes": string[]  // short bullets describing reasoning (2-4 bullets)
}

Rules:
- Clamp numeric values to two decimal places.
- Ensure damage_distribution sums to 1.0. If uncertain, reflect it in the notes.
- Use provided items to adjust distribution (e.g. if many AP items → favor AP).
- Consider champion tags and base stats when determining durability.
- AD items: Black Cleaver, Trinity Force, Blade of the Ruined King, etc.
- AP items: Rabadon's Deathcap, Luden's, Shadowflame, etc.
- Tank items: Sunfire, Thornmail, Randuin's, Spirit Visage increase durability.

Here is the input JSON:
${JSON.stringify(prompt, null, 2)}

Return JSON only (no extra commentary).
`;
  return promptText.trim();
}

/**
 * Validate and normalize AI response
 */
export function normalizeAIResponse(raw: any): {
  damageDistribution: { ad: number; ap: number; true: number };
  durability: number;
  notes: string[];
} {
  // Extract damage distribution
  let dist = raw.damage_distribution || raw.damageDistribution || raw.damage || { ad: 0, ap: 0, true: 0 };
  
  dist.ad = Number(dist.ad) || 0;
  dist.ap = Number(dist.ap) || 0;
  dist.true = Number(dist.true) || 0;

  // Normalize to sum to 1
  const sum = dist.ad + dist.ap + dist.true;
  if (sum <= 0) {
    dist = { ad: 0.5, ap: 0.5, true: 0 };
  } else {
    dist.ad = Math.round((dist.ad / sum) * 100) / 100;
    dist.ap = Math.round((dist.ap / sum) * 100) / 100;
    dist.true = Math.round((dist.true / sum) * 100) / 100;

    // Fix rounding issues
    const total = dist.ad + dist.ap + dist.true;
    if (total !== 1) {
      const maxKey = Object.keys(dist).reduce((a, b) => 
        (dist as any)[a] > (dist as any)[b] ? a : b
      ) as keyof typeof dist;
      dist[maxKey] = Number((dist[maxKey] + (1 - total)).toFixed(2));
    }
  }

  // Extract and validate durability
  let durability = Number(raw.durability || raw.durability_score || raw.durabilityScore || 0.5);
  if (isNaN(durability)) durability = 0.5;
  durability = Math.max(0, Math.min(1, Math.round(durability * 100) / 100));

  // Extract notes
  const notes: string[] = Array.isArray(raw.notes) 
    ? raw.notes.map((n: any) => String(n).slice(0, 500))
    : (raw.notes ? [String(raw.notes).slice(0, 500)] : []);

  return {
    damageDistribution: dist,
    durability,
    notes,
  };
}

/**
 * Attempt to parse JSON from LLM response (handles extra text)
 */
export function safeParseAIResponse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Attempt to extract JSON block
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {}
    }
    return null;
  }
}

/**
 * Determine primary role from U.GG data or fallback to tags
 */
export function determinePrimaryRole(
  champion: DDragonChampion,
  primaryRoles: number[] | undefined,
  roleIndexToName: typeof ROLE_INDEX_TO_NAME
): string {
  if (primaryRoles && primaryRoles.length > 0) {
    const roleIndex = primaryRoles[0];
    return roleIndexToName[roleIndex] || 'unknown';
  }

  // Fallback to tags
  const tags = champion.tags;
  if (tags.includes('Mage')) return 'mid';
  if (tags.includes('Assassin')) return 'mid';
  if (tags.includes('Marksman')) return 'adc';
  if (tags.includes('Support')) return 'support';
  if (tags.includes('Fighter')) return 'top';
  if (tags.includes('Tank')) return 'top';
  
  return 'unknown';
}

