import { parseUGG } from "./parser";
import type { RawPayload } from "./types";
import {
  getDDragonVersion,
  versionToPatch,
  getUGGVersions,
  getChampionRankingVersion,
  buildUGGChampionRankingUrl,
  fetchUGGWithFallback,
  PatchNotFoundError,
  logFetchStart,
  logFetchSuccess,
  logFetchWarning,
} from "../utils";

export async function fetchAndParse(): Promise<{
  parsed: ReturnType<typeof parseUGG>;
  patch: string;
  currentPatch: string;
  usedFallback: boolean;
}> {
  logFetchStart('champion stats');
  
  // Get latest version
  const latestVersion = await getDDragonVersion({ cache: 'no-store' });
  const currentPatch = versionToPatch(latestVersion);
  
  console.log(`📊 Using patch ${currentPatch}`);
  
  // Get UGG versions data
  const versions = await getUGGVersions({ cache: 'no-store' });
  
  // Try to fetch with fallback patches
  const patches = [currentPatch];
  const prevPatch1 = currentPatch.split('_').map((v, i) => i === 1 ? String(parseInt(v) - 1) : v).join('_');
  const prevPatch2 = currentPatch.split('_').map((v, i) => i === 1 ? String(parseInt(v) - 2) : v).join('_');
  patches.push(prevPatch1, prevPatch2);
  
  let result: { data: RawPayload; patch: string } | null = null;
  
  for (const p of patches) {
    const patchData = versions[p];
    
    if (!patchData?.champion_ranking) {
      continue;
    }
    
    const championRankingVersion = patchData.champion_ranking;
    const url = buildUGGChampionRankingUrl(p, 'emerald_plus', championRankingVersion);
    
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (response.ok) {
        const data = await response.json() as RawPayload;
        result = { data, patch: p };
        
        if (p !== currentPatch) {
          logFetchWarning(`Using fallback patch ${p} for champion stats`);
        }
        break;
      }
    } catch (err) {
      // Try next patch
      continue;
    }
  }
  
  if (!result) {
    throw new PatchNotFoundError(currentPatch, patches);
  }
  
  logFetchSuccess('champion stats');
  return {
    parsed: parseUGG(result.data),
    patch: result.patch,
    currentPatch,
    usedFallback: result.patch !== currentPatch,
  };
}
