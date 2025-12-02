/**
 * Shared utilities for data fetchers and parsers
 * Reduces code duplication across data modules
 */

// ============================================================================
// API BASE URLS
// ============================================================================

export const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
export const UGG_STATS_BASE = process.env.UGG_STATS_BASE || 'https://stats2.u.gg/lol/1.5';
export const UGG_API_URL = 'https://u.gg/api';
export const BIGBRAIN_BASE = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg';

// ============================================================================
// PATCH VERSION UTILITIES
// ============================================================================

/**
 * Convert DDragon version to U.GG patch format
 * Example: "14.23.1" -> "14_23"
 */
export function versionToPatch(version: string): string {
  const parts = version.split('.');
  return `${parts[0]}_${parts[1]}`;
}

/**
 * Convert U.GG patch to version format
 * Example: "14_23" -> "14.23"
 */
export function patchToVersion(patch: string): string {
  return patch.replace('_', '.');
}

/**
 * Get previous patch version
 * Example: "14_23" -> "14_22"
 */
export function getPreviousPatch(patch: string): string | null {
  const parts = patch.split('_');
  const major = parseInt(parts[0]);
  const minor = parseInt(parts[1]);
  
  if (minor > 1) {
    return `${major}_${minor - 1}`;
  } else if (major > 1) {
    // Go to previous major version's last minor (approximate)
    return `${major - 1}_24`;
  }
  
  return null;
}

/**
 * Get list of fallback patches (current and up to N previous)
 */
export function getPatchFallbackList(currentPatch: string, count: number = 3): string[] {
  const patches: string[] = [currentPatch];
  let patch = currentPatch;
  
  for (let i = 0; i < count - 1; i++) {
    const prev = getPreviousPatch(patch);
    if (prev) {
      patches.push(prev);
      patch = prev;
    } else {
      break;
    }
  }
  
  return patches;
}

// ============================================================================
// DDRAGON API UTILITIES
// ============================================================================

export interface FetchOptions {
  timeout?: number;
  cache?: RequestCache;
  retries?: number;
}

const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  timeout: 20000,
  cache: 'default',
  retries: 2,
};

/**
 * Fetch with timeout and retry logic
 */
export async function fetchWithRetry<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout, cache, retries } = { ...DEFAULT_FETCH_OPTIONS, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries!; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout!),
        cache,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries!) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed to fetch ${url} after ${retries! + 1} attempts: ${lastError?.message}`);
}

/**
 * Get latest DataDragon version
 */
export async function getDDragonVersion(options?: FetchOptions): Promise<string> {
  const url = `${DDRAGON_BASE}/api/versions.json`;
  const versions = await fetchWithRetry<string[]>(url, options);
  return versions[0];
}

/**
 * Get list of available DataDragon versions
 */
export async function getDDragonVersions(options?: FetchOptions): Promise<string[]> {
  const url = `${DDRAGON_BASE}/api/versions.json`;
  return fetchWithRetry<string[]>(url, options);
}

// ============================================================================
// U.GG API UTILITIES
// ============================================================================

/**
 * Fetch from U.GG with patch fallback
 * Tries current patch first, then falls back to previous patches
 */
export async function fetchUGGWithFallback<T>(
  urlTemplate: (patch: string) => string,
  currentPatch: string,
  options: FetchOptions & { fallbackCount?: number } = {}
): Promise<{ data: T; patch: string } | null> {
  const { fallbackCount = 3, ...fetchOptions } = options;
  const patches = getPatchFallbackList(currentPatch, fallbackCount);
  
  const errors: Array<{ patch: string; error: string }> = [];
  
  for (const patch of patches) {
    try {
      const url = urlTemplate(patch);
      const data = await fetchWithRetry<T>(url, { ...fetchOptions, retries: 1 });
      
      if (patch !== currentPatch) {
        console.log(`⚠️  Data not available for patch ${currentPatch}, using fallback patch ${patch}`);
      }
      
      return { data, patch };
    } catch (error) {
      errors.push({ 
        patch, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  console.error(`❌ Failed to fetch data for all patches:`, errors);
  return null;
}

/**
 * Get U.GG API version info
 */
export async function getUGGVersions(options?: FetchOptions): Promise<Record<string, any>> {
  const url = `${BIGBRAIN_BASE}/ugg-api-versions.json`;
  return fetchWithRetry<Record<string, any>>(url, { ...options, cache: 'no-store' });
}

/**
 * Get champion ranking version for a patch
 */
export async function getChampionRankingVersion(
  patch: string,
  options?: FetchOptions
): Promise<string | null> {
  try {
    const versions = await getUGGVersions(options);
    const patchData = versions[patch];
    
    if (!patchData?.champion_ranking) {
      console.warn(`No champion_ranking version found for patch ${patch}`);
      return null;
    }
    
    return patchData.champion_ranking;
  } catch (error) {
    console.error(`Failed to get champion ranking version:`, error);
    return null;
  }
}

// ============================================================================
// URL BUILDERS
// ============================================================================

/**
 * Build U.GG stats URL
 */
export function buildUGGStatsUrl(
  endpoint: string,
  patch: string,
  version: string = '1.5.0'
): string {
  return `${UGG_STATS_BASE}/${endpoint}/${patch}/ranked_solo_5x5/${version}.json`;
}

/**
 * Build U.GG overview URL for a champion
 */
export function buildUGGOverviewUrl(
  patch: string,
  championKey: string,
  version: string = '1.5.0'
): string {
  return `${UGG_STATS_BASE}/overview/${patch}/ranked_solo_5x5/${championKey}/${version}.json`;
}

/**
 * Build U.GG matchups URL for a champion
 */
export function buildUGGMatchupsUrl(
  patch: string,
  championId: number,
  version: string = '1.5.0'
): string {
  return `${UGG_STATS_BASE}/matchups/${patch}/ranked_solo_5x5/${championId}/${version}.json`;
}

/**
 * Build U.GG primary roles URL
 */
export function buildUGGPrimaryRolesUrl(
  patch: string,
  version: string = '1.5.0'
): string {
  return `${UGG_STATS_BASE}/primary_roles/${patch}/${version}.json`;
}

/**
 * Build U.GG champion ranking URL
 */
export function buildUGGChampionRankingUrl(
  patch: string,
  tier: string,
  version: string
): string {
  const uggApiVersion = version.split('.').slice(0, 2).join('.');
  return `https://stats2.u.gg/lol/${uggApiVersion}/champion_ranking/world/${patch}/ranked_solo_5x5/${tier}/${version}.json`;
}

// ============================================================================
// DATA VALIDATION
// ============================================================================

/**
 * Check if response data is valid and not empty
 */
export function isValidData(data: any): boolean {
  if (!data) return false;
  if (typeof data === 'object' && Object.keys(data).length === 0) return false;
  if (Array.isArray(data) && data.length === 0) return false;
  return true;
}

/**
 * Validate and extract nested data
 */
export function extractNestedData<T>(
  data: any,
  path: (string | number)[],
  defaultValue: T | null = null
): T | null {
  let current = data;
  
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current !== undefined ? current : defaultValue;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class DataFetchError extends Error {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'DataFetchError';
  }
}

export class PatchNotFoundError extends Error {
  constructor(
    public readonly patch: string,
    public readonly triedPatches: string[]
  ) {
    super(`No data available for patch ${patch} or fallback patches: ${triedPatches.join(', ')}`);
    this.name = 'PatchNotFoundError';
  }
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Log data fetch start
 */
export function logFetchStart(source: string, identifier?: string): void {
  const id = identifier ? ` (${identifier})` : '';
  console.log(`🔄 Fetching from ${source}${id}...`);
}

/**
 * Log data fetch success
 */
export function logFetchSuccess(source: string, itemCount?: number): void {
  const count = itemCount !== undefined ? ` (${itemCount} items)` : '';
  console.log(`✅ Successfully fetched from ${source}${count}`);
}

/**
 * Log data fetch warning
 */
export function logFetchWarning(message: string): void {
  console.warn(`⚠️  ${message}`);
}

/**
 * Log data fetch error
 */
export function logFetchError(source: string, error: Error): void {
  console.error(`❌ Failed to fetch from ${source}:`, error.message);
}

// ============================================================================
// CACHING UTILITIES
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  patch?: string;
}

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  
  constructor(private ttlMs: number = 5 * 60 * 1000) {} // 5 minutes default
  
  set(key: string, data: T, patch?: string): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      patch,
    });
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

// Export cache instances for common data
export const versionCache = new SimpleCache<string>(10 * 60 * 1000); // 10 minutes
export const patchDataCache = new SimpleCache<any>(5 * 60 * 1000); // 5 minutes

/**
 * Get cached version or fetch new one
 */
export async function getCachedDDragonVersion(): Promise<string> {
  const cached = versionCache.get('latest');
  if (cached) return cached;
  
  const version = await getDDragonVersion();
  versionCache.set('latest', version);
  return version;
}

