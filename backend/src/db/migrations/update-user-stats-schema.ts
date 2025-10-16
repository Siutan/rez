import { turso } from '../turso';

/**
 * Update user_champion_stats table to add username and tagline columns
 * Run this if you already have an existing user_champion_stats table
 */
export async function updateUserStatsSchema() {
  try {
    // Check if columns already exist by querying the table info
    const tableInfo = await turso.execute(`PRAGMA table_info(user_champion_stats)`);
    
    const columns = tableInfo.rows.map(row => row.name);
    const hasUserName = columns.includes('riot_user_name');
    const hasTagLine = columns.includes('riot_tag_line');
    
    if (!hasUserName || !hasTagLine) {
      console.log('⚠️  Migrating user_champion_stats table...');
      
      // SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS directly
      // So we need to check first and then add if needed
      if (!hasUserName) {
        await turso.execute(`
          ALTER TABLE user_champion_stats 
          ADD COLUMN riot_user_name TEXT NOT NULL DEFAULT ''
        `);
        console.log('✅ Added riot_user_name column');
      }
      
      if (!hasTagLine) {
        await turso.execute(`
          ALTER TABLE user_champion_stats 
          ADD COLUMN riot_tag_line TEXT NOT NULL DEFAULT ''
        `);
        console.log('✅ Added riot_tag_line column');
      }
      
      console.log('✅ User stats schema migration complete');
    } else {
      console.log('✅ User stats schema is already up to date');
    }
  } catch (error) {
    console.error('❌ Failed to migrate user stats schema:', error);
    throw error;
  }
}

