# Champion Builds & AI Classification

This module fetches recommended champion builds from U.GG and DataDragon, then uses AI (Gemini) to classify champions with behavioral attributes like damage distribution and durability.

## Overview

The system consists of three main components:

1. **Build Fetcher** - Fetches champion data from DataDragon and build recommendations from U.GG
2. **AI Classifier** - Uses Google Gemini to infer champion attributes (damage type, durability)
3. **Database Storage** - Stores builds and AI attributes in Turso database

## Files

- **`types.ts`**: TypeScript type definitions for all data structures
- **`parser.ts`**: Parsing and transformation logic
- **`index.ts`**: Data fetching functions (U.GG + DataDragon)
- **`../migrations/champion-builds.ts`**: Database schema and migration logic
- **`../../services/ai/champion-classifier.ts`**: AI classification service

## Data Sources

### DataDragon (Riot Games)
- **Champion Data**: Stats, abilities, tags
- **Items Data**: Item names, stats, descriptions
- **Base URL**: `https://ddragon.leagueoflegends.com/cdn`

### U.GG
- **Primary Roles**: Champion → Role mapping
- **Build Overview**: Recommended items, runes, skill order
- **Base URL**: `https://stats2.u.gg/lol/1.5`

### Google Gemini AI
- **Classification**: Damage distribution, durability scoring
- **Model**: `gemini-1.5-flash` (configurable via env)

## Environment Variables

```bash
# Required for AI Classification
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp  # optional

# Optional (has defaults)
UGG_STATS_BASE=https://stats2.u.gg/lol/1.5
```

**Note**: AI classification is optional. If `GEMINI_API_KEY` is not set, the system will only fetch and store builds without AI attributes.

## Database Schema

### `champion_builds` Table

Stores recommended builds for each champion per role and patch.

```sql
CREATE TABLE champion_builds (
  champion_id       TEXT    NOT NULL,
  champion_key      TEXT    NOT NULL,
  champion_name     TEXT    NOT NULL,
  role              TEXT    NOT NULL,  -- jungle, adc, support, top, mid
  patch             TEXT    NOT NULL,  -- e.g., "14_23"
  mythic_items      TEXT    NOT NULL,  -- JSON array of item IDs
  core_items        TEXT    NOT NULL,  -- JSON array of item IDs
  starting_items    TEXT    NOT NULL,  -- JSON array of item IDs
  boots             INTEGER NULL,      -- item ID
  mythic_names      TEXT    NOT NULL,  -- JSON array of item names
  core_names        TEXT    NOT NULL,  -- JSON array of item names
  starting_names    TEXT    NOT NULL,  -- JSON array of item names
  boots_name        TEXT    NULL,      -- item name
  skill_order       TEXT    NOT NULL,  -- JSON array
  primary_runes     TEXT    NULL,      -- JSON object
  secondary_runes   TEXT    NULL,      -- JSON object
  shards            TEXT    NOT NULL,  -- JSON array
  last_updated_at   TEXT    NOT NULL,
  PRIMARY KEY (champion_id, role, patch)
);
```

### `champion_attributes` Table

Stores AI-inferred champion attributes.

```sql
CREATE TABLE champion_attributes (
  champion_id       TEXT    NOT NULL,
  role              TEXT    NOT NULL,
  patch             TEXT    NOT NULL,
  damage_ad         REAL    NOT NULL,  -- 0-1 (physical damage ratio)
  damage_ap         REAL    NOT NULL,  -- 0-1 (magic damage ratio)
  damage_true       REAL    NOT NULL,  -- 0-1 (true damage ratio)
  durability        REAL    NOT NULL,  -- 0-1 (tankiness/survivability)
  notes             TEXT    NOT NULL,  -- JSON array of explanation strings
  last_updated_at   TEXT    NOT NULL,
  PRIMARY KEY (champion_id, role, patch)
);
```

## Usage

### Fetch All Builds

```typescript
import { fetchAllChampionBuilds } from './db/data/champion-builds';

const { builds, version, patch, currentPatch, usedFallback } = await fetchAllChampionBuilds();

// If currentPatch data is unavailable, the system automatically tries previous patches
if (usedFallback) {
  console.log(`Using fallback patch ${patch} (current: ${currentPatch})`);
}

console.log(builds[0]);
// {
//   championId: 'Ahri',
//   championName: 'Ahri',
//   role: 'mid',
//   patch: '14_23',
//   itemNames: {
//     mythic: ['Luden\'s Companion'],
//     core: ['Shadowflame', 'Rabadon\'s Deathcap'],
//     ...
//   }
// }
```

### Run AI Classification

```typescript
import { populateChampionAttributes } from './db/migrations/champion-builds';

// Classifies all builds that don't have attributes yet
await populateChampionAttributes();
```

### Query Database

```typescript
import { getChampionBuild, getChampionAttributes } from './db/migrations/champion-builds';

// Get latest build for Ahri mid
const build = await getChampionBuild('Ahri', 'mid');

// Get AI attributes
const attrs = await getChampionAttributes('Ahri', 'mid');

console.log(attrs);
// {
//   damage_ad: 0.05,
//   damage_ap: 0.90,
//   damage_true: 0.05,
//   durability: 0.35,
//   notes: ['High AP scaling', 'Low durability mage', ...]
// }
```

## Data Flow

1. **Fetch Phase**
   ```
   DataDragon → Champion List → Champion Details
                              ↓
   U.GG → Primary Roles → Build Overview
                              ↓
   Parser → ChampionBuild objects → Database
   ```

2. **AI Classification Phase**
   ```
   Database → Builds without attributes
        ↓
   Build AI Prompts (champion stats + items)
        ↓
   Google Gemini API
        ↓
   Parse & Normalize Response
        ↓
   Database → Store Attributes
   ```

## AI Prompt Engineering

The AI classification uses a structured prompt that includes:

- **Champion Stats**: AD, AP, armor, HP, attack speed
- **Tags**: Mage, Assassin, Tank, etc.
- **Build Items**: Core and mythic item names
- **Role**: Current role being analyzed

The AI returns:
- **Damage Distribution**: `{ad: 0.1, ap: 0.85, true: 0.05}` (must sum to 1.0)
- **Durability**: `0.45` (0 = glass cannon, 1 = super tank)
- **Notes**: Reasoning bullets explaining the classification

## Scheduling

The system runs automatically via cron:

- **Pattern**: `Patterns.EVERY_WEEK` (weekly updates)
- **Staleness Check**: Builds refresh if older than 7 days
- **AI Classification**: Only runs for new builds without attributes

Manual trigger:
```typescript
import { populateChampionBuilds, populateChampionAttributes } from './db/migrations/champion-builds';

await populateChampionBuilds();      // Fetch and store builds
await populateChampionAttributes();  // AI classify unclassified builds
```

## Rate Limiting

- **U.GG**: 100ms delay between champion requests
- **Gemini AI**: 2000ms delay between classification requests
- **Retries**: 3 attempts with exponential backoff

## Error Handling

- **Network Failures**: Logged and skipped, continues with next champion
- **AI Parse Errors**: Logged with raw output for debugging
- **Missing Data**: Gracefully handles missing U.GG data, uses tag-based fallbacks

## Cost Optimization

AI classification is expensive. To minimize costs:

1. **Incremental Updates**: Only classifies new builds
2. **Patch-Based Caching**: Attributes stored per patch
3. **Optional AI**: Works without AI, just stores builds
4. **Batch Processing**: All classifications in one session with rate limiting

## Future Extensions

From `implementation.md`:

- **Additional Attributes**: mobility, cc_score, poke, sustain, burst
- **Item Modifiers**: Map items → durability/damage deltas
- **Regression Calibration**: Train local model against game telemetry
- **Manual Override UI**: Review and correct AI classifications
- **Champion Rework Detection**: Auto-trigger re-classification on major updates

## Security

- Keep `GEMINI_API_KEY` secret
- Rotate API keys regularly
- Respect U.GG rate limits and terms of service
- Use published JSON endpoints (not HTML scraping)

