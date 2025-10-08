/**
 * DDRAGON TYPES
 */
export interface DDragonChampion {
  version: string;
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  partype: string;
  stats: {
    hp: number;
    hpperlevel: number;
    mp: number;
    mpperlevel: number;
    movespeed: number;
    armor: number;
    armorperlevel: number;
    spellblock: number;
    spellblockperlevel: number;
    attackrange: number;
    hpregen: number;
    hpregenperlevel: number;
    mpregen: number;
    mpregenperlevel: number;
    crit: number;
    critperlevel: number;
    attackdamage: number;
    attackdamageperlevel: number;
    attackspeedperlevel: number;
    attackspeed: number;
  };
  spells?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  passive?: {
    name: string;
    description: string;
  };
}

export interface DDragonItem {
  name: string;
  description: string;
  plaintext: string;
  gold: {
    base: number;
    total: number;
    sell: number;
    purchasable: boolean;
  };
  tags: string[];
  stats: Record<string, number>;
}

/**
 * U.GG BUILD DATA TYPES
 */
export interface UGGPrimaryRoles {
  [championKey: string]: number[]; // array of role indices
}

export interface UGGBuildRecommendation {
  mythic_items?: number[];
  core_items?: number[];
  starting_items?: number[];
  boots?: number;
  skill_order?: string[];
  primary_runes?: {
    tree: number;
    runes: number[];
  };
  secondary_runes?: {
    tree: number;
    runes: number[];
  };
  shards?: number[];
}

export interface UGGOverviewData {
  [roleKey: string]: UGGBuildRecommendation;
}

/**
 * ROLE MAPPING
 */
export const ROLE_INDEX_TO_NAME: Record<number, string> = {
  1: 'jungle',
  2: 'adc',
  3: 'support',
  4: 'top',
  5: 'mid',
};

export const ROLE_NAME_TO_INDEX: Record<string, number> = {
  jungle: 1,
  adc: 2,
  support: 3,
  top: 4,
  mid: 5,
};

/**
 * AI CLASSIFICATION TYPES
 */
export interface DamageDistribution {
  ad: number;  // 0-1, physical damage
  ap: number;  // 0-1, magic damage
  true: number; // 0-1, true damage
}

export interface ChampionAttributes {
  championId: string;
  championName: string;
  role: string;
  damageDistribution: DamageDistribution;
  durability: number; // 0-1
  notes: string[];
  patch: string;
}

export interface AIClassificationPrompt {
  championId: string;
  name: string;
  tags: string[];
  partype: string;
  stats: {
    attackdamage: number;
    attackdamageperlevel: number;
    armor: number;
    hp: number;
    mp: number;
    attackspeed: number;
  };
  role: string;
  buildItems: string[]; // item names
}

export interface AIClassificationResponse {
  champion_id: string;
  role: string;
  damage_distribution: {
    ad: number;
    ap: number;
    true: number;
  };
  durability: number;
  notes: string[];
}

/**
 * PARSED BUILD OUTPUT
 */
export interface ChampionBuild {
  championId: string;      // Numeric key (e.g., "103")
  championKey: string;     // DDragon string ID (e.g., "Ahri")
  championName: string;    // Display name (e.g., "Ahri")
  role: string;
  patch: string;
  items: {
    mythic: number[];
    core: number[];
    starting: number[];
    boots: number | null;
  };
  itemNames: {
    mythic: string[];
    core: string[];
    starting: string[];
    boots: string | null;
  };
  skillOrder: string[];
  runes: {
    primary: {
      tree: number;
      runes: number[];
    } | null;
    secondary: {
      tree: number;
      runes: number[];
    } | null;
    shards: number[];
  };
}

/**
 * COMBINED OUTPUT
 */
export interface EnrichedChampionData {
  build: ChampionBuild;
  attributes: ChampionAttributes | null; // null if AI classification hasn't run yet
  lastUpdatedAt: string;
}

