import { populateChampionAttributes } from "./champion-builds";

async function runAIClassification() {
  console.log('🤖 Running AI classification for champion builds...');

  try {
    await populateChampionAttributes();
    console.log('✅ AI classification complete');
  } catch (err) {
    console.error('❌ AI classification failed:', err);
    process.exit(1);
  }
}

runAIClassification();


