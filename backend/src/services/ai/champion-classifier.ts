import { GoogleGenAI } from '@google/genai';
import type {
  AIClassificationPrompt,
  ChampionAttributes,
} from '../../db/data/champion-builds/types';
import {
  generatePromptText,
  safeParseAIResponse,
  normalizeAIResponse,
} from '../../db/data/champion-builds/parser';
import { turso } from '../../db/turso';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let genAI: GoogleGenAI | null = null;

/**
 * Initialize Google GenAI client
 */
function getGenAI(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY must be set in environment variables');
  }
  
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  
  return genAI;
}

/**
 * Call Gemini API to classify a champion
 */
async function callGemini(prompt: string): Promise<string> {
  const ai = getGenAI();
  
  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });

  const text = result.text;

  if (!text) {
    throw new Error('Empty response from Gemini API');
  }

  return text;
}

/**
 * Classify a champion using AI
 */
export async function classifyChampion(
  prompt: AIClassificationPrompt,
  patch: string
): Promise<ChampionAttributes> {
  console.log(`🤖 Classifying ${prompt.name} (${prompt.role})...`);

  const promptText = generatePromptText(prompt);
  
  let responseText: string;
  try {
    responseText = await callGemini(promptText);
  } catch (err: any) {
    console.error(`AI classification failed for ${prompt.championId}:`, err.message);
    throw err;
  }

  const parsed = safeParseAIResponse(responseText);
  if (!parsed) {
    console.error(`Failed to parse AI response for ${prompt.championId}. Raw output:`, responseText);
    throw new Error(`Failed to parse AI response for ${prompt.championId}`);
  }

  const normalized = normalizeAIResponse(parsed);

  return {
    championId: prompt.championId,
    championName: prompt.name,
    role: prompt.role,
    damageDistribution: normalized.damageDistribution,
    durability: normalized.durability,
    notes: normalized.notes,
    patch,
  };
}

/**
 * Build SQL statement for upserting champion attributes to database
 */
function upsertChampionAttributes(attr: ChampionAttributes, timestamp: string) {
  const sql = `
    INSERT INTO champion_attributes (
      champion_id, champion_name, role, patch,
      damage_ad, damage_ap, damage_true,
      durability, notes, last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(champion_id, role, patch) DO UPDATE SET
      champion_name = excluded.champion_name,
      damage_ad = excluded.damage_ad,
      damage_ap = excluded.damage_ap,
      damage_true = excluded.damage_true,
      durability = excluded.durability,
      notes = excluded.notes,
      last_updated_at = excluded.last_updated_at
  `;

  return {
    sql,
    args: [
      attr.championId,
      attr.championName,
      attr.role,
      attr.patch,
      attr.damageDistribution.ad,
      attr.damageDistribution.ap,
      attr.damageDistribution.true,
      attr.durability,
      JSON.stringify(attr.notes),
      timestamp,
    ],
  };
}

/**
 * Batch classify multiple champions with rate-limited concurrency
 * Uses intelligent batching + parallel execution for best performance/cost ratio
 * Writes each batch to the database as it completes
 */
export async function batchClassifyChampions(
  prompts: AIClassificationPrompt[],
  patch: string,
  options: {
    maxConcurrent?: number;
    maxPerMinute?: number;
    batchSize?: number;
    maxRetries?: number;
  } = {}
): Promise<ChampionAttributes[]> {
  const {
    maxConcurrent = 5,    // Process 5 batches concurrently
    maxPerMinute = 100,    // Respect API rate limits
    batchSize = 10,        // 10 champions per batch for cost efficiency
    maxRetries = 3
  } = options;
  
  console.log(`🤖 Starting AI classification with ${maxConcurrent}×${batchSize} concurrency...`);
  
  const { RateLimitedExecutor, chunk } = await import('../../utils/rate-limited-executor');
  const executor = new RateLimitedExecutor(maxConcurrent, maxPerMinute);
  
  // Split prompts into batches
  const batches = chunk(prompts, batchSize);
  console.log(`   ${batches.length} batches of up to ${batchSize} champions each`);
  
  const results: ChampionAttributes[] = [];
  const failed: { prompt: AIClassificationPrompt; error: Error }[] = [];
  let totalProcessed = 0;
  
  // Process batches concurrently with rate limiting
  const batchResults = await Promise.all(
    batches.map((batch, batchIndex) =>
      executor.add(async () => {
        const batchResults: ChampionAttributes[] = [];
        
        // Process each champion in the batch
        for (const prompt of batch) {
          let attempts = 0;
          let success = false;
          
          while (attempts < maxRetries && !success) {
            try {
              const result = await classifyChampion(prompt, patch);
              batchResults.push(result);
              success = true;
              
              totalProcessed++;
              console.log(`  ✓ ${totalProcessed}/${prompts.length} - ${prompt.name}`);
            } catch (err: any) {
              attempts++;
              
              if (attempts >= maxRetries) {
                failed.push({ prompt, error: err });
                console.error(`  ❌ ${prompt.name}: ${err.message}`);
              } else {
                console.warn(`  ⚠ Retry ${attempts}/${maxRetries} for ${prompt.name}...`);
                await new Promise(r => setTimeout(r, 500 * attempts));
              }
            }
          }
        }
        
        // Write this batch to database immediately
        if (batchResults.length > 0) {
          const timestamp = new Date().toISOString();
          const dbBatch = batchResults.map(attr => upsertChampionAttributes(attr, timestamp));
          
          try {
            await turso.batch(dbBatch, 'write');
            console.log(`  💾 Batch ${batchIndex + 1}/${batches.length} written to database (${batchResults.length} champions)`);
          } catch (err: any) {
            console.error(`  ❌ Failed to write batch ${batchIndex + 1} to database:`, err.message);
            // Still return results so they're not lost
          }
        }
        
        return batchResults;
      })
    )
  );
  
  // Flatten results
  batchResults.forEach(batch => results.push(...batch));
  
  // Print metrics
  executor.printMetrics();
  
  if (failed.length > 0) {
    console.error(`\n❌ Failed: ${failed.length}/${prompts.length} champions`);
  }
  
  console.log(`\n✅ Successfully classified ${results.length}/${prompts.length} champions`);
  
  return results;
}

/**
 * Check if AI service is configured and available
 */
export function isAIServiceAvailable(): boolean {
  return Boolean(GEMINI_API_KEY);
}

