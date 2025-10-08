// Comprehensive database debugging and maintenance tool
// Run: bun run debug-db.ts [--missing]

import { turso } from './src/db/turso';
import { 
  getLatestDDragonVersion, 
  getChampionList,
  getUGGPrimaryRoles,
} from './src/db/data/champion-builds';
import { determinePrimaryRole } from './src/db/data/champion-builds/parser';
import { versionToPatch } from './src/db/data/utils';

const ROLE_INDEX_TO_NAME: Record<number, string> = {
  1: 'jungle',
  2: 'adc',
  3: 'support',
  4: 'top',
  5: 'mid',
};

const showMissing = process.argv.includes('--missing');

async function debugDatabase() {
  console.log('🔍 Database Debug Tool\n');
  
  try {
    // 1. Check champion_builds table
    console.log('📊 CHAMPION BUILDS:');
    const buildCount = await turso.execute(`SELECT COUNT(*) as count FROM champion_builds`);
    console.log(`   Total: ${buildCount.rows[0].count}`);
    
    const patchCount = await turso.execute(`
      SELECT patch, COUNT(*) as count 
      FROM champion_builds 
      GROUP BY patch
    `);
    patchCount.rows.forEach(row => {
      console.log(`   Patch ${row.patch}: ${row.count} builds`);
    });
    
    const roleCount = await turso.execute(`
      SELECT role, COUNT(*) as count 
      FROM champion_builds 
      GROUP BY role
      ORDER BY count DESC
    `);
    console.log('   By role:');
    roleCount.rows.forEach(row => {
      console.log(`     ${row.role}: ${row.count}`);
    });
    
    // 2. Check champion_attributes table
    console.log('\n🤖 CHAMPION ATTRIBUTES:');
    
    const tables = await turso.execute(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='champion_attributes'
    `);
    
    if (tables.rows.length === 0) {
      console.log('   ⚠️  Table does not exist!');
    } else {
      const schema = await turso.execute(`PRAGMA table_info(champion_attributes)`);
      const columns = schema.rows.map((row: any) => row.name);
      
      const attrCount = await turso.execute(`SELECT COUNT(*) as count FROM champion_attributes`);
      console.log(`   Total: ${attrCount.rows[0].count}`);
      console.log(`   Has champion_name: ${columns.includes('champion_name') ? '✅' : '❌'}`);
      
      if ((attrCount.rows[0].count as number) > 0) {
        const attrPatchCount = await turso.execute(`
          SELECT patch, COUNT(*) as count 
          FROM champion_attributes 
          GROUP BY patch
        `);
        attrPatchCount.rows.forEach(row => {
          console.log(`   Patch ${row.patch}: ${row.count} attributes`);
        });
      }
    }
    
    // 3. Check for missing attributes
    console.log('\n🔍 DATA INTEGRITY:');
    const missing = await turso.execute(`
      SELECT COUNT(*) as count
      FROM champion_builds b
      LEFT JOIN champion_attributes a 
        ON b.champion_id = a.champion_id 
        AND b.role = a.role 
        AND b.patch = a.patch
      WHERE a.champion_id IS NULL
    `);
    
    const missingCount = missing.rows[0].count as number;
    if (missingCount > 0) {
      console.log(`   ⚠️  ${missingCount} builds without attributes`);
    } else {
      console.log(`   ✅ All builds have attributes`);
    }
    
    // 4. Sample data
    console.log('\n📋 SAMPLE DATA:');
    const sample = await turso.execute(`
      SELECT b.champion_id, b.champion_name, b.role, b.patch,
             a.damage_ad, a.damage_ap, a.durability
      FROM champion_builds b
      LEFT JOIN champion_attributes a
        ON b.champion_id = a.champion_id 
        AND b.role = a.role 
        AND b.patch = a.patch
      ORDER BY b.champion_name
      LIMIT 5
    `);
    
    sample.rows.forEach((row: any) => {
      const attrs = row.damage_ad !== null
        ? `AD:${row.damage_ad.toFixed(2)} AP:${row.damage_ap.toFixed(2)} Dur:${row.durability.toFixed(2)}`
        : 'No attributes';
      console.log(`   ${row.champion_name} (${row.role}) - ${attrs}`);
    });
    
    // 5. Find missing champions (if --missing flag)
    if (showMissing) {
      console.log('\n🔍 CHECKING FOR MISSING CHAMPIONS...\n');
      
      const version = await getLatestDDragonVersion();
      const patch = versionToPatch(version.toString());
      const championList = await getChampionList(version.toString());
      const allChampions = Object.values(championList);
      
      const dbChampions = await turso.execute(`
        SELECT DISTINCT champion_id FROM champion_builds
      `);
      
      const dbChampionIds = new Set(dbChampions.rows.map(row => row.champion_id));
      const missingChampions = allChampions.filter(c => !dbChampionIds.has(c.key));
      
      if (missingChampions.length === 0) {
        console.log('✅ No missing champions! All champions in database.');
      } else {
        console.log(`⚠️  Found ${missingChampions.length} missing champions:\n`);
        
        const primaryRoles = await getUGGPrimaryRoles(patch).catch(() => ({}));
        
        missingChampions.forEach(champion => {
          const primaryRoleIndices = (primaryRoles as any)[champion.key] || (primaryRoles as any)[champion.id];
          const role = determinePrimaryRole(champion, primaryRoleIndices, ROLE_INDEX_TO_NAME);
          console.log(`   ${champion.name.padEnd(20)} (${champion.key.padEnd(4)}) - ${role}`);
        });
      }
    }
    
    // 6. Summary
    const totalBuilds = buildCount.rows[0].count as number;
    const totalAttrs = tables.rows.length > 0 
      ? (await turso.execute(`SELECT COUNT(*) as count FROM champion_attributes`)).rows[0].count as number 
      : 0;
    
    console.log('\n💡 SUMMARY:');
    console.log(`   Builds: ${totalBuilds}`);
    console.log(`   Attributes: ${totalAttrs}`);
    console.log(`   Missing attributes: ${missingCount}`);
    
    if (totalBuilds < 165) {
      console.log('\n⚠️  Low build count - run: bun run migrate');
    } else if (missingCount > 0) {
      console.log('\n⚠️  Missing attributes - run: bun run migrate');
    } else {
      console.log('\n✅ Database is healthy!');
    }
    
    if (!showMissing) {
      console.log('\n💡 Tip: Run with --missing flag to check for missing champions');
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
    throw err;
  }
}

debugDatabase()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });

