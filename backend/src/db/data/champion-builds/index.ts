import type {
  DDragonChampion,
  DDragonItem,
  UGGPrimaryRoles,
  ChampionBuild,
  ROLE_INDEX_TO_NAME,
} from './types';
import { parseBuildData, determinePrimaryRole } from './parser';
import {
  DDRAGON_BASE,
  getDDragonVersion,
  getCachedDDragonVersion,
  versionToPatch,
  fetchWithRetry,
  fetchUGGWithFallback,
  buildUGGOverviewUrl,
  buildUGGPrimaryRolesUrl,
  logFetchStart,
  logFetchSuccess,
  logFetchWarning,
} from '../utils';

export * from './types';
export * from './parser';

/**
 * Get latest DataDragon version (with caching)
 */
export async function getLatestDDragonVersion(): Promise<string> {
  return getCachedDDragonVersion();
}

/**
 * Get champion list from DataDragon
 */
export async function getChampionList(version: string): Promise<Record<string, DDragonChampion>> {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`;
  const response = await fetchWithRetry<{ data: Record<string, DDragonChampion> }>(url);
  return response.data;
}

/**
 * Get detailed champion data from DataDragon
 */
export async function getChampionData(version: string, championId: string): Promise<DDragonChampion> {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/en_US/champion/${championId}.json`;
  const response = await fetchWithRetry<{ data: Record<string, DDragonChampion> }>(url);
  return response.data[championId];
}

/**
 * Get items data from DataDragon
 */
export async function getItemsData(version: string): Promise<Record<string, DDragonItem>> {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/en_US/item.json`;
  const response = await fetchWithRetry<{ data: Record<string, DDragonItem> }>(url);
  return response.data;
}

/**
 * Get primary roles mapping from U.GG with fallback
 */
export async function getUGGPrimaryRoles(patch: string): Promise<{ data: UGGPrimaryRoles; patch: string; usedFallback: boolean }> {
  const result = await fetchUGGWithFallback<UGGPrimaryRoles>(
    (p) => `${buildUGGPrimaryRolesUrl(p)}`,
    patch
  );
  
  if (!result) {
    throw new Error(`Failed to fetch primary roles for patch ${patch} and fallbacks`);
  }
  
  return {
    data: result.data,
    patch: result.patch,
    usedFallback: result.patch !== patch,
  };
}

/**
 * Get champion build overview from U.GG with fallback
 */
export async function getUGGOverview(
  patch: string,
  championKey: string
): Promise<any | null> {
  const result = await fetchUGGWithFallback<any>(
    (p) => buildUGGOverviewUrl(p, championKey),
    patch,
    { fallbackCount: 2 } // Only try current and 1 fallback for individual champions
  );
  
  if (!result) {
    logFetchWarning(`No U.GG overview data found for champion ${championKey}`);
    return null;
  }
  
  return result.data;
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
  const patch = versionToPatch(version);
  
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
  currentPatch: string;
  usedFallback: boolean;
}> {
  logFetchStart('champion builds');
  
  // Fetch version first, then parallelize dependent fetches
  const version = await getLatestDDragonVersion();
  const currentPatch = versionToPatch(version);
  
  console.log(`📦 Using version ${version} (patch ${currentPatch})`);
  
  // Fetch all static data in parallel
  let primaryRolesResult: { data: UGGPrimaryRoles; patch: string; usedFallback: boolean } | null = null;
  
  const [championList, itemsData] = await Promise.all([
    getChampionList(version),
    getItemsData(version),
  ]);
  
  try {
    primaryRolesResult = await getUGGPrimaryRoles(currentPatch);
  } catch (err) {
    console.warn('Failed to fetch U.GG primary roles, will use tag-based fallback', err);
  }
  
  const primaryRoles = primaryRolesResult?.data || {} as UGGPrimaryRoles;
  const patch = primaryRolesResult?.patch || currentPatch;
  const usedFallback = primaryRolesResult?.usedFallback || false;
  
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
    currentPatch,
    usedFallback,
  };
}

