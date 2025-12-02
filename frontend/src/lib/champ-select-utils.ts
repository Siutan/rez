import type { ChampionStats, SummonerRankResult } from "./services/api";

import topLaneIcon from "../assets/images/lane-icons/top.png";
import jungleLaneIcon from "../assets/images/lane-icons/jungle.png";
import middleLaneIcon from "../assets/images/lane-icons/middle.png";
import bottomLaneIcon from "../assets/images/lane-icons/bot.png";
import supportLaneIcon from "../assets/images/lane-icons/support.png";

import ironRankIcon from "../assets/images/rank-icons/iron-rank.png";
import bronzeRankIcon from "../assets/images/rank-icons/bronze-rank.png";
import silverRankIcon from "../assets/images/rank-icons/silver-rank.png";
import goldRankIcon from "../assets/images/rank-icons/gold-rank.png";
import platinumRankIcon from "../assets/images/rank-icons/platinum-rank.png";
import emeraldRankIcon from "../assets/images/rank-icons/emerald-rank.png";
import diamondRankIcon from "../assets/images/rank-icons/diamond-rank.png";
import masterRankIcon from "../assets/images/rank-icons/master-rank.png";
import grandmasterRankIcon from "../assets/images/rank-icons/grandmaster-rank.png";
import challengerRankIcon from "../assets/images/rank-icons/challenger-rank.png";

const laneIconMap: Record<string, string> = {
  top: topLaneIcon,
  jungle: jungleLaneIcon,
  jg: jungleLaneIcon,
  middle: middleLaneIcon,
  mid: middleLaneIcon,
  bottom: bottomLaneIcon,
  adc: bottomLaneIcon,
  utility: supportLaneIcon,
  support: supportLaneIcon,
};

const rankIconMap: Record<string, string> = {
  iron: ironRankIcon,
  bronze: bronzeRankIcon,
  silver: silverRankIcon,
  gold: goldRankIcon,
  platinum: platinumRankIcon,
  emerald: emeraldRankIcon,
  diamond: diamondRankIcon,
  master: masterRankIcon,
  grandmaster: grandmasterRankIcon,
  challenger: challengerRankIcon,
};

export function getLaneIconSrc(position?: string | null): string | null {
  if (!position) return null;
  return laneIconMap[position.toLowerCase()] ?? null;
}

// Kept for potential textual fallbacks elsewhere
export function getPositionIcon(position: string): string {
  const icons: Record<string, string> = {
    top: "Top",
    jungle: "Jg",
    middle: "Mid",
    bottom: "Adc",
    utility: "Sup",
  };
  return icons[position?.toLowerCase()] ?? "?";
}

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Linearly interpolate between #BE123C (0) and #06B6D4 (100).
 */
export function getStatColor(value: number, min = 0, max = 100): string {
  if (max === min) return "#BE123C";
  const t = clamp01((value - min) / (max - min));

  const start = { r: 0xbe, g: 0x12, b: 0x3c }; // #BE123C
  const end = { r: 0x06, g: 0xb6, b: 0xd4 }; // #06B6D4

  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

export function getChampionStatsForPlayer(
  statsMap: Record<string, ChampionStats[]>,
  gameName: string,
  tagLine: string,
  championId: number,
): ChampionStats | null {
  if (!gameName || !tagLine) return null;

  const playerKey = `${gameName}#${tagLine}`;
  const stats = statsMap[playerKey];
  if (!stats) return null;

  return stats.find((stat) => stat.champion_id === championId) ?? null;
}

function getBestRankEntry(
  ranksMap: Record<string, SummonerRankResult>,
  gameName: string,
  tagLine: string,
): { tier: string | null; text: string } | null {
  if (!gameName || !tagLine) return null;
  const entry = ranksMap[`${gameName}#${tagLine}`];
  const ranks = entry?.ranks ?? [];
  if (ranks.length === 0) return null;

  // Prefer solo queue, then flex, else first available
  const solo = ranks.find((r) => r.queueType === "RANKED_SOLO_5x5");
  const flex = ranks.find((r) => r.queueType === "RANKED_FLEX_SR");
  const best = solo ?? flex ?? ranks[0];
  if (!best?.tier) return null;

  const division = best.rank ? ` ${best.rank}` : "";
  const lp = typeof best.lp === "number" ? ` ${best.lp} LP` : "";
  return {
    tier: best.tier,
    text: `${best.tier}${division}${lp}`,
  };
}

export function getRankText(
  ranksMap: Record<string, SummonerRankResult>,
  gameName: string,
  tagLine: string,
): string {
  const info = getBestRankEntry(ranksMap, gameName, tagLine);
  return info?.text ?? "Unranked";
}

export function getRankTier(
  ranksMap: Record<string, SummonerRankResult>,
  gameName: string,
  tagLine: string,
): string | null {
  const info = getBestRankEntry(ranksMap, gameName, tagLine);
  return info?.tier ?? null;
}

export function getRankIconSrc(tier: string | null | undefined): string | null {
  if (!tier) return null;
  return rankIconMap[tier.toLowerCase()] ?? null;
}


