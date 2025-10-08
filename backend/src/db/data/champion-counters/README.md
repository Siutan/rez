# Champion Counters Data Parser

This module parses champion matchup/counter data from u.gg API.

## Data Source

The raw data comes from u.gg's matchups endpoint:
```
https://stats2.u.gg/lol/1.5/matchups/{patch}_{subpatch}/ranked_solo_5x5/{champion_id}/1.5.0.json
```

Example: `https://stats2.u.gg/lol/1.5/matchups/15_19/ranked_solo_5x5/134/1.5.0.json`

Where:
- `{patch}_{subpatch}`: Game patch version (e.g., `15_19` for patch 15.19)
- `{champion_id}`: The champion ID to get matchup data for (e.g., `134` for Syndra)

## Raw Data Structure

The raw data is structured as a nested object:
```typescript
{
  [regionKey: string]: {      // "1"-"18" (1=na1, 12=world, etc.)
    [tierKey: string]: {       // "1"-"17" (14=master_plus, etc.)
      [roleKey: string]: [     // "1"-"5" (1=jungle, 5=mid, etc.)
        ChampionDataArray[],   // Array of champion matchup stats
        string                 // Timestamp
      ]
    }
  }
}
```

### Key Mappings

**Region Keys:**
- `1` = na1
- `2` = euw1
- `3` = kr
- `12` = world
- etc. (see `REGION_KEY_MAP` in parser.ts)

**Tier Keys:**
- `1` = challenger
- `3` = master
- `14` = master_plus
- etc. (see `TIER_KEY_MAP` in parser.ts)

**Role Keys:**
- `1` = jungle
- `2` = support
- `3` = adc
- `4` = top
- `5` = mid

### Champion Data Array Format

Each champion's matchup data is stored as a 15-element array:

```typescript
[
  champion_id,                 // [0] Target champion ID
  losses,                      // [1] Number of losses
  matches,                     // [2] Total matches
  -xp_adv_15,                  // [3] Cumulative XP advantage at 15min (inverted)
  -gold_adv_15,                // [4] Cumulative gold advantage at 15min (inverted)
  duo_gold_adv_15,             // [5] Cumulative duo gold advantage at 15min
  -cs_adv_15,                  // [6] Cumulative CS advantage at 15min (inverted)
  duo_cs_adv_15,               // [7] Cumulative duo CS advantage at 15min
  -jungle_cs_adv_15,           // [8] Cumulative jungle CS advantage at 15min (inverted)
  -kill_adv_15,                // [9] Cumulative kill advantage at 15min (inverted)
  duo_kill_adv_15,             // [10] Cumulative duo kill advantage at 15min
  duo_xp_adv_15,               // [11] Cumulative duo XP advantage at 15min
  -carry_percentage_15,        // [12] Cumulative carry percentage at 15min (inverted)
  duo_carry_percentage_15,     // [13] Cumulative duo carry percentage at 15min
  -team_gold_difference_15     // [14] Cumulative team gold difference at 15min (inverted)
]
```

**Note:** Many fields are stored as:
1. **Cumulative values** (need to be divided by matches to get averages)
2. **Inverted** (need to be negated to get correct sign)

## Parsing Logic

### Win Rate Calculation
```typescript
win_rate = ((matches - losses) / matches) * 100
```

### Pick Rate Calculation
```typescript
pick_rate = (matches / totalMatches) * 100
```

Where `totalMatches` is the sum of all champion matches in the dataset.

### Advantage Calculations
Most advantages are inverted and cumulative:
```typescript
average = -raw_value / matches
```

Exception - Carry Percentage:
```typescript
carry_percentage_15 = (-raw_value / matches) * 10
```

## Usage

```typescript
import { parseChampionCounters, parseAllRoles } from './champion-counters';
import rawData from './raw-counters-data.json';

// Parse specific region/tier/role
const midCounters = parseChampionCounters(rawData, 'world', 'master_plus', 'mid');

// Parse all roles for world_master_plus
const allRoles = parseAllRoles(rawData);
// Returns: { world_master_plus_jungle, world_master_plus_support, ... }
```

## Output Format

```typescript
{
  counters: [
    {
      champion_id: 86,
      win_rate: 40.91,
      pick_rate: 0.14,
      tier: {
        pick_rate: 0.14,
        win_rate: 40.91
      },
      matches: 22,
      xp_adv_15: 5,
      gold_adv_15: 304,
      cs_adv_15: 11.5,
      jungle_cs_adv_15: -0.4,
      kill_adv_15: -0.36,
      carry_percentage_15: -125,
      team_gold_difference_15: -81,
      // ... other fields
    }
  ],
  last_updated: "2025-10-07T01:48:21.148056Z",
  matches: 15293
}
```

