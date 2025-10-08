import type {
  DDragonChampion,
  DDragonItem,
  UGGPrimaryRoles,
  ChampionBuild,
  ROLE_INDEX_TO_NAME,
} from './types';
import { parseBuildData, determinePrimaryRole } from './parser';

export * from './types';
export * from './parser';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const UGG_STATS_BASE = process.env.UGG_STATS_BASE || 'https://stats2.u.gg/lol/1.5';

/**
 * Get latest DataDragon version
 */
export async function getLatestDDragonVersion(): Promise<string> {
  const url = `${DDRAGON_BASE}/api/versions.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch DDragon versions: ${response.status}`);
  }
  
  const versions: string[] = await response.json();
  return versions[0];
}

/**
 * Get champion list from DataDragon
 */
export async function getChampionList(version: string): Promise<Record<string, DDragonChampion>> {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch champion list: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Get detailed champion data from DataDragon
 */
export async function getChampionData(version: string, championId: string): Promise<DDragonChampion> {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/en_US/champion/${championId}.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch champion ${championId}: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data[championId];
}

/**
 * Get items data from DataDragon
 */
export async function getItemsData(version: string): Promise<Record<string, DDragonItem>> {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/en_US/item.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Get primary roles mapping from U.GG
 */
export async function getUGGPrimaryRoles(patch: string): Promise<UGGPrimaryRoles> {
  // Example: https://stats2.u.gg/lol/1.5/primary_roles/15_19/1.5.0.json
  const url = `${UGG_STATS_BASE}/primary_roles/${patch}/1.5.0.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch U.GG primary roles: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get champion build overview from U.GG
 */
export async function getUGGOverview(
  patch: string,
  championKey: string
): Promise<any | null> {
  // Example: https://stats2.u.gg/lol/1.5/overview/15_19/ranked_solo_5x5/103/1.5.0.json
  const url = `${UGG_STATS_BASE}/overview/${patch}/ranked_solo_5x5/${championKey}/1.5.0.json`;
  
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    
    if (!response.ok) {
      console.warn(`U.GG overview not found for champion ${championKey} (${response.status})`);
      return null;
    }
    
    return response.json();
  } catch (err) {
    console.warn(`Failed to fetch U.GG overview for champion ${championKey}:`, err);
    return null;
  }
}

/**
 * Convert DDragon version to U.GG patch slug
 * Example: "14.23.1" -> "14_23"
 */
export function versionToPatchSlug(version: string): string {
  const parts = version.split('.');
  return `${parts[0]}_${parts[1]}`;
}

/**
 * Fetch complete build data for a champion
 */
export async function fetchChampionBuild(
  champion: DDragonChampion,
  version: string,
  itemsData: Record<string, DDragonItem>,
  primaryRolesMap: UGGPrimaryRoles,
  roleIndexToName: typeof ROLE_INDEX_TO_NAME
): Promise<ChampionBuild | null> {
  const patch = versionToPatchSlug(version);
  
  // Determine primary role
  const primaryRoles = primaryRolesMap[champion.key] || primaryRolesMap[champion.id];
  const role = determinePrimaryRole(champion, primaryRoles, roleIndexToName);
  
  if (role === 'unknown') {
    console.warn(`Could not determine role for ${champion.name}`);
    return null;
  }
  
  // Fetch U.GG overview
  const overview = await getUGGOverview(patch, champion.key);
  
  // Extract build recommendation for this role
  let buildRec = null;
  if (overview && typeof overview === 'object') {
    // U.GG structure: { "1": { "1": { "3": [build_data] } } }
    // First level: tier/patch
    // Second level: role number (1=jungle, 2=adc, 3=support, 4=top, 5=mid)
    // Third level: metric/rank level (usually "3")
    // Fourth level: actual build array
    
    const roleNumber = {
      'jungle': 1,
      'adc': 2,
      'support': 3,
      'top': 4,
      'mid': 5,
    }[role] || 5;
    
    // Navigate through nested structure
    const firstKey = Object.keys(overview)[0]; // Usually "1"
    if (firstKey && overview[firstKey]?.[roleNumber]) {
      const roleData = overview[firstKey][roleNumber];
      // Get the build data (usually under key "3")
      if (roleData['3'] && Array.isArray(roleData['3'])) {
        // U.GG format: roleData['3'] = [buildArray, timestamp]
        // We only want the build array (first element)
        const rawData = roleData['3'];
        buildRec = Array.isArray(rawData[0]) ? rawData[0] : rawData;
      } else {
        // Try first available key
        const buildKey = Object.keys(roleData)[0];
        if (buildKey) {
          const rawData = roleData[buildKey];
          buildRec = Array.isArray(rawData[0]) ? rawData[0] : rawData;
        }
      }
    } else {
      // Debug: log what we got
      if (process.env.DEBUG_BUILDS) {
        console.warn(`⚠️  ${champion.name}: No data for role ${role} (${roleNumber}). Available: ${Object.keys(overview[firstKey] || {}).join(',')}`);
      }
    }
  } else {
    if (process.env.DEBUG_BUILDS && overview) {
      console.warn(`⚠️  ${champion.name}: Invalid overview type: ${typeof overview}`);
    }
  }
  
  const build = parseBuildData(champion, role, buildRec, itemsData, patch);
  
  // Validate that we actually got meaningful data
  if (!buildRec || !Array.isArray(buildRec) || buildRec.length === 0) {
    if (process.env.DEBUG_BUILDS) {
      console.warn(`⚠️  ${champion.name}: No build data for ${role}`);
    }
    return null;
  }
  
  return build;
}

/**
 * Fetch all champion builds
 */
export async function fetchAllChampionBuilds(): Promise<{
  builds: ChampionBuild[];
  version: string;
  patch: string;
}> {
  console.log('📦 Fetching initial data in parallel...');
  
  // Fetch version first, then parallelize dependent fetches
  const version = await getLatestDDragonVersion();
  const patch = versionToPatchSlug(version);
  
  console.log(`📦 Using version ${version} (patch ${patch})`);
  
  // Fetch all static data in parallel
  const [championList, itemsData, primaryRoles] = await Promise.all([
    getChampionList(version),
    getItemsData(version),
    getUGGPrimaryRoles(patch).catch((err) => {
      console.warn('Failed to fetch U.GG primary roles, will use tag-based fallback', err);
      return {} as UGGPrimaryRoles;
    }),
  ]);
  
  console.log(`✅ Fetched champion list (${Object.keys(championList).length} champions) and items data`);
  
  const ROLE_INDEX_TO_NAME: Record<number, string> = {
    1: 'jungle',
    2: 'support',
    3: 'adc',
    4: 'top',
    5: 'mid',
  };
  
  const builds: ChampionBuild[] = [];
  const champions = Object.values(championList);
  
  console.log(`📦 Processing ${champions.length} champions with concurrency...`);
  
  // Use dynamic import to avoid circular dependencies
  const { pLimit } = await import('../../../utils/concurrent');
  
  // Track failures for debugging
  let nullBuilds = 0;
  let errors = 0;
  
  // Process 8 champions concurrently (respectful rate limiting)
  const results = await pLimit(
    champions,
    8,
    async (champion, index) => {
      try {
        // Small stagger to avoid thundering herd
        if (index % 8 !== 0) {
          await new Promise(resolve => setTimeout(resolve, 50 * (index % 8)));
        }
        
        const build = await fetchChampionBuild(
          champion,
          version,
          itemsData,
          primaryRoles,
          ROLE_INDEX_TO_NAME
        );
        
        if (!build) {
          nullBuilds++;
        }
        
        if (index % 20 === 0) {
          console.log(`  ⏳ ${index + 1}/${champions.length} processed... (${index + 1 - nullBuilds - errors} builds, ${nullBuilds} skipped, ${errors} errors)`);
        }
        
        return build;
      } catch (err) {
        errors++;
        console.error(`  ❌ Failed to fetch build for ${champion.name}:`, err);
        return null;
      }
    }
  );
  
  // Filter out nulls
  const validBuilds = results.filter((b): b is ChampionBuild => b !== null);
  builds.push(...validBuilds);
  
  console.log(`✅ Fetched ${builds.length} champion builds`);
  console.log(`   └─ ${nullBuilds} champions skipped (no build data)`);
  console.log(`   └─ ${errors} champions failed with errors`);
  console.log(`   └─ Total champions processed: ${champions.length}`);
  
  return {
    builds,
    version,
    patch,
  };
}

