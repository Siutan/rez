import { turso } from '../turso';

/**
 * Create database schema for user stats (runs synchronously before server starts)
 */
export async function createUserStatsSchema() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS user_champion_stats (
      puuid             TEXT    NOT NULL,
      riot_user_name    TEXT    NOT NULL,
      riot_tag_line     TEXT    NOT NULL,
      region_id         TEXT    NOT NULL,
      season_id         INTEGER NOT NULL,
      champion_id       INTEGER NOT NULL,
      assists           INTEGER NOT NULL,
      cs                INTEGER NOT NULL,
      damage            INTEGER NOT NULL,
      damage_taken      INTEGER NOT NULL,
      deaths            INTEGER NOT NULL,
      double_kills      INTEGER NOT NULL,
      first_place       INTEGER NOT NULL,
      gold              INTEGER NOT NULL,
      kills             INTEGER NOT NULL,
      max_deaths        INTEGER NOT NULL,
      max_kills         INTEGER NOT NULL,
      penta_kills       INTEGER NOT NULL,
      quadra_kills      INTEGER NOT NULL,
      total_matches     INTEGER NOT NULL,
      total_placement   INTEGER NOT NULL,
      triple_kills      INTEGER NOT NULL,
      wins              INTEGER NOT NULL,
      win_rate          REAL    NOT NULL,
      avg_kda           REAL    NOT NULL,
      avg_cs            REAL    NOT NULL,
      avg_damage        REAL    NOT NULL,
      avg_damage_taken  REAL    NOT NULL,
      avg_gold          REAL    NOT NULL,
      last_updated_at   TEXT    NOT NULL,
      PRIMARY KEY (puuid, champion_id)
    )
  `);

  console.log('✅ User champion stats schema created');
}
