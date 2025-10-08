/**
 * Shared utilities for database migrations
 * Reduces code duplication across migration files
 */

import { turso } from '../turso';
import { getLatestDDragonVersion } from '../data/champion-builds';

// ============================================================================
// TIME & DATE UTILITIES
// ============================================================================

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Convert milliseconds to readable duration
 */
export function formatDuration(ms: number): string {
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

/**
 * Check if a date is older than a threshold
 */
export function isOlderThan(dateString: string, thresholdMs: number): boolean {
  const date = new Date(dateString).getTime();
  const now = Date.now();
  return now - date > thresholdMs;
}

// ============================================================================
// PATCH VERSION UTILITIES
// ============================================================================

/**
 * Convert DDragon version (e.g., "14.19.1") to u.gg patch format (e.g., "14_19")
 */
export function versionToPatch(version: string): string {
  const parts = version.split('.');
  return `${parts[0]}_${parts[1]}`;
}

/**
 * Convert u.gg patch format (e.g., "14_19") to version string (e.g., "14.19")
 */
export function patchToVersion(patch: string): string {
  return patch.replace('_', '.');
}

/**
 * Get current game patch from DDragon
 */
export async function getCurrentPatch(): Promise<{ patch: string; version: string }> {
  const version = await getLatestDDragonVersion();
  const patch = versionToPatch(version);
  return { patch, version };
}

// ============================================================================
// STALENESS CHECKING UTILITIES
// ============================================================================

export interface StalenessCheckOptions {
  tableName: string;
  thresholdMs: number;
  timestampColumn?: string;
  whereClause?: string;
  whereArgs?: any[];
  minRecordCount?: number;
  expectedRecordCount?: number;
  logPrefix?: string;
}

/**
 * Generic staleness checker for any table
 * Returns true if data should be refreshed
 */
export async function isDataStale(options: StalenessCheckOptions): Promise<boolean> {
  const {
    tableName,
    thresholdMs,
    timestampColumn = 'last_updated_at',
    whereClause = '',
    whereArgs = [],
    minRecordCount,
    expectedRecordCount,
    logPrefix = 'Data',
  } = options;

  try {
    const whereSQL = whereClause ? `WHERE ${whereClause}` : '';
    const sql = `
      SELECT ${timestampColumn}, COUNT(*) as count 
      FROM ${tableName} 
      ${whereSQL}
    `;

    const result = await turso.execute({
      sql,
      args: whereArgs,
    });

    // No data exists
    if (result.rows.length === 0 || result.rows[0].count === 0) {
      return true;
    }

    const count = result.rows[0].count as number;
    const lastUpdated = result.rows[0][timestampColumn] as string | null;

    // No timestamp recorded
    if (!lastUpdated) {
      return true;
    }

    // Check if count is suspiciously low
    if (minRecordCount && count < minRecordCount) {
      console.log(`⚠️  Only ${count} records found in ${tableName} (minimum: ${minRecordCount}), forcing refresh...`);
      return true;
    }

    if (expectedRecordCount && count < expectedRecordCount) {
      console.log(`⚠️  Only ${count} records found in ${tableName} (expected: ${expectedRecordCount}), forcing refresh...`);
      return true;
    }

    // Check staleness
    const isStale = isOlderThan(lastUpdated, thresholdMs);

    if (!isStale) {
      console.log(`📊 ${logPrefix} is fresh (updated ${new Date(lastUpdated).toLocaleString()}, ${count} records)`);
    }

    return isStale;
  } catch (err) {
    console.log(`⚠️  Could not check ${tableName} staleness, will refresh:`, err);
    return true;
  }
}

// ============================================================================
// PROGRESS TRACKING UTILITIES
// ============================================================================

export interface ProgressTracker {
  total: number;
  current: number;
  startTime: number;
  successCount: number;
  errorCount: number;
  logInterval?: number;
}

/**
 * Create a progress tracker
 */
export function createProgressTracker(total: number, logInterval: number = 50): ProgressTracker {
  return {
    total,
    current: 0,
    startTime: Date.now(),
    successCount: 0,
    errorCount: 0,
    logInterval,
  };
}

/**
 * Update progress and optionally log
 */
export function updateProgress(
  tracker: ProgressTracker,
  success: boolean = true,
  message?: string
): void {
  tracker.current++;
  if (success) {
    tracker.successCount++;
  } else {
    tracker.errorCount++;
  }

  // Log at intervals
  if (tracker.logInterval && tracker.current % tracker.logInterval === 0) {
    const elapsed = formatDuration(Date.now() - tracker.startTime);
    console.log(`  ⏳ Progress: ${tracker.current}/${tracker.total} (${elapsed})`);
  }

  // Custom message
  if (message) {
    console.log(`  ${message}`);
  }
}

/**
 * Log final progress summary
 */
export function logProgressSummary(tracker: ProgressTracker, operation: string = 'Operation'): void {
  const elapsed = formatDuration(Date.now() - tracker.startTime);
  console.log(`\n✅ ${operation} complete in ${elapsed}`);
  console.log(`   └─ Success: ${tracker.successCount}, Errors: ${tracker.errorCount}, Total: ${tracker.total}`);
}

// ============================================================================
// RATE LIMITING UTILITIES
// ============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private delayMs: number;
  private lastCallTime: number = 0;

  constructor(delayMs: number = 500) {
    this.delayMs = delayMs;
  }

  /**
   * Wait if needed to respect rate limit
   */
  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastCall;
      await sleep(waitTime);
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.wait();
    return fn();
  }
}

// ============================================================================
// BATCH OPERATION UTILITIES
// ============================================================================

export interface BatchOperation {
  sql: string;
  args: any[];
}

/**
 * Execute batch operations with progress tracking
 */
export async function executeBatchWithProgress(
  operations: BatchOperation[],
  operationName: string = 'records'
): Promise<void> {
  if (operations.length === 0) {
    console.log(`⚠️  No ${operationName} to process`);
    return;
  }

  console.log(`💾 Writing ${operations.length} ${operationName} to database...`);

  await turso.batch(operations, 'write');

  console.log(`✅ Successfully wrote ${operations.length} ${operationName}`);
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Log a migration start
 */
export function logMigrationStart(migrationName: string): number {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 Starting: ${migrationName}`);
  console.log(`${'='.repeat(60)}\n`);
  return Date.now();
}

/**
 * Log a migration end
 */
export function logMigrationEnd(migrationName: string, startTime: number): void {
  const elapsed = formatDuration(Date.now() - startTime);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Completed: ${migrationName} in ${elapsed}`);
  console.log(`${'='.repeat(60)}\n`);
}

/**
 * Log a section header
 */
export function logSection(title: string): void {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`📋 ${title}`);
  console.log(`${'─'.repeat(40)}\n`);
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
        
        if (onRetry) {
          onRetry(attempt + 1, error);
        } else {
          console.log(`⚠️  Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
        }

        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Execute a function and handle errors gracefully
 */
export async function tryExecute<T>(
  fn: () => Promise<T>,
  errorMessage: string,
  defaultValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`❌ ${errorMessage}:`, err);
    return defaultValue;
  }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate that a table has data
 */
export async function validateTableHasData(
  tableName: string,
  minCount: number = 1
): Promise<boolean> {
  try {
    const result = await turso.execute({
      sql: `SELECT COUNT(*) as count FROM ${tableName}`,
      args: [],
    });

    const count = result.rows[0]?.count as number;
    const isValid = count >= minCount;

    if (!isValid) {
      console.warn(`⚠️  Table ${tableName} has ${count} records (expected at least ${minCount})`);
    }

    return isValid;
  } catch (err) {
    console.error(`❌ Could not validate ${tableName}:`, err);
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const TIME_CONSTANTS = {
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  ONE_MONTH: 30 * 24 * 60 * 60 * 1000,
};

