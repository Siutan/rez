import { turso } from '../turso';

/**
 * Determine the latest known patch from champion_stats.
 * Falls back to champion_builds if stats are empty.
 */
async function getLatestPatch(): Promise<string | null> {
  // Prefer champion_stats (they are fast to fetch and always written)
  let result = await turso.execute(`
    SELECT patch FROM champion_stats
    WHERE patch != 'unknown'
    ORDER BY patch DESC
    LIMIT 1
  `);

  if (result.rows.length > 0) {
    return result.rows[0].patch as string;
  }

  // Fallback: champion_builds (should also always have a patch)
  result = await turso.execute(`
    SELECT patch FROM champion_builds
    ORDER BY patch DESC
    LIMIT 1
  `);

  if (result.rows.length > 0) {
    return result.rows[0].patch as string;
  }

  return null;
}

/**
 * Remove data for all patches except the latest one.
 * Currently cleans:
 *   - champion_stats
 *   - champion_builds
 *   - worst_matchups
 */
export async function cleanupOldPatchData() {
  const latestPatch = await getLatestPatch();

  if (!latestPatch) {
    console.log('🧹 No patch found in database – skipping old patch cleanup');
    return;
  }

  console.log(`🧹 Cleaning up old patch data (keeping patch ${latestPatch})...`);

  const tables = ['champion_stats', 'worst_matchups', 'champion_builds'] as const;

  for (const table of tables) {
    const deleteResult = await turso.execute({
      sql: `DELETE FROM ${table} WHERE patch != ?`,
      args: [latestPatch],
    });

    // libsql returns changes in different shapes; be defensive
    const changes =
      (deleteResult as any).rowsAffected ??
      (deleteResult as any).changes ??
      0;

    console.log(`   • ${table}: removed ${changes} rows for old patches`);
  }

  console.log('✅ Old patch data cleanup complete');
}


