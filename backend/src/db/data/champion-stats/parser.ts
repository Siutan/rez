// parser.ts
import {
    RawPayload,
    RawChampionEntry,
    RoleInRaw,
    RoleOut,
    ChampionOut,
    OutputPayload,
  } from "./types";
  
  const roleMap: Record<RoleInRaw, RoleOut> = {
    adc: "adc",
    jungle: "jungle",
    mid: "mid",
    supp: "support",
    top: "top",
  };
  
  function safeDiv(n: number, d: number): number {
    return d === 0 ? 0 : n / d;
  }
  
  /**
   * The service stores pick_rate as a *percentage* of total queue matches (0-100),
   * not a 0-1 fraction. That’s why tiny picks show up like 0.0049 (i.e., 0.0049%).
   */
  function pickRate(matches: number, queueTypeTotalMatches: number): number {
    return safeDiv(matches, queueTypeTotalMatches) * 100;
  }
  
  function banRate(champId: string, bansMap: Record<string, number>): number {
    const bans = bansMap[champId] ?? 0;
    const total = bansMap.total_matches ?? 0;
    return safeDiv(bans, total) * 100;
  }
  
  function toWorstAgainst(
    role: RoleOut,
    championId: string,
    badAgainst: RawChampionEntry[1]
  ) {
    const bad_against = badAgainst.map(([oppId, wins, matches]) => {
      const wr = safeDiv(wins, matches) * 100;
      return {
        champion_id: oppId,
        wins,
        matches,
        win_rate: +wr.toFixed(12),
        opp_win_rate: +(100 - wr).toFixed(12),
      };
    });
    return { bad_against, champion_id: championId, role };
  }
  
  /**
   * We don’t get “stdevs” from the raw. To mimic the example, we’ll provide
   * a sensible approximation: z-score of win_rate within the same role.
   * (It’s close enough for tier-bucketing and ordering; swap this if you later
   * reverse their exact formula.)
   */
  function computeRoleWinRateZScores(rows: ChampionOut[]): Map<string, number> {
    const wrs = rows.map(r => r.win_rate);
    const mean =
      wrs.reduce((a, b) => a + b, 0) / (wrs.length || 1);
    const variance =
      wrs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (wrs.length || 1);
    const std = Math.sqrt(variance) || 1;
  
    const z = new Map<string, number>();
    rows.forEach(r => z.set(r.champion_id, (r.win_rate - mean) / std));
    return z;
  }
  
  function championFromRaw(
    roleIn: RoleInRaw,
    row: RawChampionEntry,
    bansMap: Record<string, number>,
    queueTypeTotalMatches: number
  ): ChampionOut {
    const role = roleMap[roleIn];
    const [
      champion_id,
      badAgainst,
      wins,
      matches,
      totalDamage,
      totalGold,
      kills,
      assists,
      deaths,
      totalCs,
    ] = row;
  
    const wr = safeDiv(wins, matches) * 100;
    const pr = pickRate(matches, queueTypeTotalMatches);
    const br = banRate(champion_id, bansMap);
  
    const avg_damage = safeDiv(totalDamage, matches) / 1000; // damage scaled by 1000 in raw
    const avg_gold = safeDiv(totalGold, matches);
    const avg_cs = safeDiv(totalCs, matches);
    const avg_kda = safeDiv(kills + assists, Math.max(1, deaths));
  
    return {
      win_rate: +wr.toFixed(12),
      pick_rate: +pr.toFixed(12),
      ban_rate: +br.toFixed(12),
      avg_damage: +avg_damage.toFixed(12),
      avg_kda: +avg_kda.toFixed(12),
      avg_cs: +avg_cs.toFixed(12),
      avg_gold: +avg_gold.toFixed(12),
      champion_id,
      role,
      champion_link: { champion_id, role },
      worst_against: toWorstAgainst(role, champion_id, badAgainst),
      matches,
      tier: {
        pick_rate: +pr.toFixed(12),
        stdevs: 0, // filled later per-role
      },
    };
  }
  
  export function parseUGG(raw: RawPayload): OutputPayload {
    const [byRole, bansMap, last_updated_at, queue_type_total_matches] = raw;
  
    const win_rates = Object.entries(byRole).reduce((acc, [roleIn, rows]) => {
      const role = roleMap[roleIn as RoleInRaw];
      const champions: ChampionOut[] = rows.map(r =>
        championFromRaw(roleIn as RoleInRaw, r, bansMap, queue_type_total_matches)
      );
  
      // Compute stdevs approximation per role (z-score on win_rate)
      const z = computeRoleWinRateZScores(champions);
      champions.forEach(c => {
        c.tier.stdevs = +(z.get(c.champion_id) ?? 0);
      });
  
      (acc as any)[role] = champions;
      return acc;
    }, {} as Record<RoleOut, ChampionOut[]>);
  
    // Note: in your example, total_matches === queue_type_total_matches.
    const total_matches = queue_type_total_matches;
  
    return {
      data: {
        win_rates,
        last_updated_at,
        total_matches,
        queue_type_total_matches,
      },
      loading: false,
      error: null,
      idle: false,
    };
  }