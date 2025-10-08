export interface ChampionCounter {
  champion_id: number;
  win_rate: number;
  pick_rate: number;
  tier: {
    pick_rate: number;
    win_rate: number;
  };
  matches: number;
  xp_adv_15: number;
  gold_adv_15: number;
  duo_gold_adv_15: number;
  cs_adv_15: number;
  duo_cs_adv_15: number;
  jungle_cs_adv_15: number;
  kill_adv_15: number;
  duo_kill_adv_15: number;
  duo_xp_adv_15: number;
  carry_percentage_15: number;
  duo_carry_percentage_15: number;
  team_gold_difference_15: number;
}

export interface ChampionCountersData {
  counters: ChampionCounter[];
  last_updated: string;
  matches: number;
}

export interface ChampionCountersRawData {
  [regionKey: string]: {
    [tierKey: string]: {
      [roleKey: string]: [
        Array<[
          number, // champion_id
          number, // losses
          number, // matches
          number, // -xp_adv_15 (cumulative)
          number, // -gold_adv_15 (cumulative)
          number, // duo_gold_adv_15 (cumulative)
          number, // -cs_adv_15 (cumulative)
          number, // duo_cs_adv_15 (cumulative)
          number, // -jungle_cs_adv_15 (cumulative)
          number, // -kill_adv_15 (cumulative)
          number, // duo_kill_adv_15 (cumulative)
          number, // duo_xp_adv_15 (cumulative)
          number, // -carry_percentage_15 (cumulative)
          number, // duo_carry_percentage_15 (cumulative)
          number  // -team_gold_difference_15 (cumulative)
        ]>,
        string // timestamp
      ];
    };
  };
}

