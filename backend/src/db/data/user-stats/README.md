# User Stats Parser

This module provides functionality to fetch, parse, and store player statistics from the U.GG API.

## Overview

The user stats system aggregates champion performance data across multiple queue types (Normal Draft, Ranked Solo, Ranked Flex) and stores it in a database indexed by `puuid` and `champion_id`.

## Files

- **`types.ts`**: TypeScript type definitions for API responses and parsed data
- **`parser.ts`**: Core parsing logic that aggregates stats across queue types
- **`index.ts`**: API fetching functions and exports
- **`example.ts`**: Example usage with sample data
- **`../migrations/user-stats.ts`**: Database schema and migration functions

## Usage

### 1. Fetch and Parse Player Stats

```typescript
import { fetchAndParsePlayerStats } from './db/data/user-stats';

const stats = await fetchAndParsePlayerStats({
  riotUserName: 'homosaurussex',
  riotTagLine: '5131',
  regionId: 'oc1',
  role: 7,        // 7 = all roles
  seasonId: 25,   // current season
  queueType: [400, 420, 440], // normal draft, ranked solo, ranked flex
});

console.log(stats.champions); // Array of aggregated champion stats
```

### 2. Store Stats in Database

```typescript
import { fetchAndStoreUserStats } from './db/migrations/user-stats';

await fetchAndStoreUserStats({
  riotUserName: 'homosaurussex',
  riotTagLine: '5131',
  regionId: 'oc1',
});
```

### 3. Query Stats from Database

```typescript
import { getUserStats } from './db/migrations/user-stats';

const stats = await getUserStats('SfTHPhao0be_jJOWuozJsLDtq-qVl1W1axvTRiAhsoC4ohRh5RpHkda9L5xKzWgvGQX5vLUPKi-DUg');
```

## Data Structure

### Raw API Response

The U.GG API returns data split by queue type:

```json
{
  "data": {
    "fetchPlayerStatistics": [
      {
        "queueType": 400,
        "puuid": "...",
        "regionId": "oc1",
        "basicChampionPerformances": [
          {
            "championId": 145,
            "totalMatches": 14,
            "wins": 6,
            "kills": 85,
            "deaths": 65,
            "assists": 59,
            ...
          }
        ]
      }
    ]
  }
}
```

### Aggregated Output

The parser merges stats for the same champion across all queue types:

```typescript
{
  puuid: "...",
  regionId: "oc1",
  seasonId: 25,
  champions: [
    {
      championId: 145,
      totalMatches: 16,  // Combined from all queues
      wins: 7,
      winRate: 43.75,    // Computed
      avgKDA: 2.21,      // Computed
      avgCS: 182.2,      // Computed
      avgDamage: 20133,  // Computed
      ...
    }
  ]
}
```

## Database Schema

```sql
CREATE TABLE user_champion_stats (
  puuid             TEXT    NOT NULL,
  region_id         TEXT    NOT NULL,
  season_id         INTEGER NOT NULL,
  champion_id       INTEGER NOT NULL,
  total_matches     INTEGER NOT NULL,
  wins              INTEGER NOT NULL,
  kills             INTEGER NOT NULL,
  deaths            INTEGER NOT NULL,
  assists           INTEGER NOT NULL,
  win_rate          REAL    NOT NULL,
  avg_kda           REAL    NOT NULL,
  avg_cs            REAL    NOT NULL,
  avg_damage        REAL    NOT NULL,
  avg_gold          REAL    NOT NULL,
  last_updated_at   TEXT    NOT NULL,
  PRIMARY KEY (puuid, champion_id)
);
```

## Queue Types

- **400**: Normal Draft 5v5
- **420**: Ranked Solo/Duo
- **440**: Ranked Flex

## Computed Metrics

The parser automatically computes the following metrics:

- **`winRate`**: `(wins / totalMatches) * 100`
- **`avgKDA`**: `(kills + assists) / max(1, deaths)`
- **`avgCS`**: `cs / totalMatches`
- **`avgDamage`**: `damage / totalMatches`
- **`avgDamageTaken`**: `damageTaken / totalMatches`
- **`avgGold`**: `gold / totalMatches`

## Example

See `example.ts` for a complete working example with sample data.

## API Details

**Endpoint**: `https://u.gg/api`

**GraphQL Query**: `getPlayerStats`

**Headers**:
- `content-type: application/json`
- `origin: https://u.gg`
- `x-app-type: web`

See `index.ts` for the complete GraphQL query and request format.

