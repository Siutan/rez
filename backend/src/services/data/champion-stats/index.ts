import { parseUGG } from "./parser";
import type { RawPayload } from "./types";

export async function fetchAndParse(): Promise<ReturnType<typeof parseUGG>> {
  // get patch version from https://ddragon.leagueoflegends.com/api/versions.json
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" });
  if (!versionsRes.ok) throw new Error(`Versions fetch failed: ${versionsRes.status} ${versionsRes.statusText}`);
  const versions = await versionsRes.json() as string[];

  // pick first item in array
  const latestVersion = versions[0];

  // format take split by . and take first two numbers, join with _
  const patchVersion = latestVersion.split('.').slice(0, 2).join('_');

  const uggVersionsRes = await fetch("https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/ugg-api-versions.json", { cache: "no-store" });
  if (!uggVersionsRes.ok) throw new Error(`UGG versions fetch failed: ${uggVersionsRes.status} ${uggVersionsRes.statusText}`);
  const uggVersions = await uggVersionsRes.json() as Record<string, any>;

  // get object with key as patch version
  const patchData = uggVersions[patchVersion];
  if (!patchData) throw new Error(`No UGG data found for patch version: ${patchVersion}`);

  // get champion_ranking version from object
  const championRankingVersion = patchData.champion_ranking;
  if (!championRankingVersion) throw new Error(`No champion_ranking version found for patch: ${patchVersion}`);

  const uggApiVersion = patchData.champion_ranking.split('.').slice(0, 2).join('.');


  // build url with patch version and champion_ranking version
  const url = `https://stats2.u.gg/lol/${uggApiVersion}/champion_ranking/world/${patchVersion}/ranked_solo_5x5/emerald_plus/${championRankingVersion}.json`;
  console.log(url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as RawPayload;
  return parseUGG(raw);
}
