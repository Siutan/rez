// types.ts
export type RoleInRaw = "adc" | "jungle" | "mid" | "supp" | "top";
export type RoleOut = "adc" | "jungle" | "mid" | "support" | "top";

/**
 * RAW SHAPE (from https://stats2.u.gg/.../1.5.0.json)
 *
 * raw[0] : { [role in RoleInRaw]: RawChampionEntry[] }
 * raw[1] : { [championId: string]: number; total_matches: number; "-1": number; ... }  // per-champ ban counts + total_matches
 * raw[2] : string  // last_updated_at (ISO)
 * raw[3] : number  // queue_type_total_matches (total games in this slice)
 *
 * Each RawChampionEntry is a tuple:
 * [
 *   championId: string,
 *   badAgainst: [champId:number, wins:number, matches:number][],
 *   wins: number,
 *   matches: number,
 *   totalDamage: number,     // sum of damage, scaled by 1000 in raw
 *   totalGold: number,       // sum of gold
 *   kills: number,
 *   assists: number,
 *   deaths: number,
 *   totalCs: number
 * ]
 */
export type RawChampionEntry = [
  championId: string,
  badAgainst: [championId: number, wins: number, matches: number][],
  wins: number,
  matches: number,
  totalDamage: number,
  totalGold: number,
  kills: number,
  assists: number,
  deaths: number,
  totalCs: number
];

export type RawPayload = [
  Record<RoleInRaw, RawChampionEntry[]>,
  Record<string, number> & { total_matches: number },
  string,   // last_updated_at
  number    // queue_type_total_matches
];

// OUTPUT SHAPE (what the service emits)

export interface WorstAgainstItem {
  champion_id: number;
  wins: number;
  matches: number;
  win_rate: number;     // % (0-100)
  opp_win_rate: number; // % (0-100)
}

export interface WorstAgainst {
  bad_against: WorstAgainstItem[];
  champion_id: string;
  role: RoleOut;
}

export interface ChampionOut {
  win_rate: number;    // % (0-100)
  pick_rate: number;   // % of total matches (0-100), note: values often <1 so it looks like 0.00xx
  ban_rate: number;    // % (0-100) using raw[1][champ]/raw[1].total_matches
  avg_damage: number;  // damage per game (raw damage is scaled by 1000)
  avg_kda: number;     // (kills + assists) / max(1, deaths)
  avg_cs: number;      // per game
  avg_gold: number;    // per game
  champion_id: string;
  role: RoleOut;
  champion_link: { champion_id: string; role: RoleOut };
  worst_against: WorstAgainst;
  matches: number;
  tier: {
    pick_rate: number; // duplicate of pick_rate as in your example
    stdevs: number;    // see note below; we approximate as z-score on win_rate within role
  };
}

export interface OutputPayload {
  data: {
    win_rates: Record<RoleOut, ChampionOut[]>;
    last_updated_at: string;
    total_matches: number;
    queue_type_total_matches: number;
  };
  loading: boolean;
  error: null;
  idle: boolean;
}