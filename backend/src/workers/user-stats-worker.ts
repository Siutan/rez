// Background Worker for Processing User Stats Updates

import { userStatsUpdateQueue, type UserStatsUpdateJob } from '../services/update-queue';
import { fetchAndStoreUserStats } from '../services/user-stats';

export interface WorkerConfig {
  pollIntervalMs: number;
  maxConcurrentJobs: number;
  enableLogging: boolean;
}

export interface WorkerStats {
  isRunning: boolean;
  processedJobs: number;
  failedJobs: number;
  queueStats: ReturnType<typeof userStatsUpdateQueue.getStats>;
  uptimeMs: number;
  lastProcessedAt?: number;
}

class UserStatsWorker {
  private isRunning = false;
  private pollInterval?: NodeJS.Timeout;
  private startTime = 0;
  private processedJobs = 0;
  private failedJobs = 0;
  private lastProcessedAt?: number;
  private config: WorkerConfig;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = {
      pollIntervalMs: 2000, // Poll every 2 seconds
      maxConcurrentJobs: 5,
      enableLogging: true,
      ...config,
    };
  }

  /**
   * Start the background worker
   */
  start(): void {
    if (this.isRunning) {
      console.warn('⚠️ User stats worker is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.processedJobs = 0;
    this.failedJobs = 0;

    console.log('🚀 Starting user stats background worker...');
    console.log(`   └─ Poll interval: ${this.config.pollIntervalMs}ms`);
    console.log(`   └─ Max concurrent jobs: ${this.config.maxConcurrentJobs}`);

    // Start polling for jobs
    this.pollInterval = setInterval(() => {
      this.processJobs();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the background worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    const uptime = Date.now() - this.startTime;
    console.log('🛑 Stopping user stats background worker...');
    console.log(`   └─ Processed ${this.processedJobs} jobs`);
    console.log(`   └─ Failed ${this.failedJobs} jobs`);
    console.log(`   └─ Uptime: ${Math.round(uptime / 1000)}s`);
  }

  /**
   * Process available jobs from the queue
   */
  private async processJobs(): Promise<void> {
    if (!this.isRunning) return;

    const queueStats = userStatsUpdateQueue.getStats();

    // Log queue status periodically
    if (this.config.enableLogging && queueStats.totalJobs > 0) {
      console.log(`📊 Queue status: ${queueStats.totalJobs} jobs (${queueStats.immediateJobs} immediate, ${queueStats.highPriorityJobs} high, ${queueStats.lowPriorityJobs} low, ${queueStats.processingJobs} processing)`);
    }

    // Process jobs up to max concurrent limit
    const jobsToProcess: UserStatsUpdateJob[] = [];
    while (jobsToProcess.length < this.config.maxConcurrentJobs) {
      const job = userStatsUpdateQueue.dequeue();
      if (!job) break;
      jobsToProcess.push(job);
    }

    if (jobsToProcess.length === 0) {
      return;
    }

    // Process all jobs in parallel
    const promises = jobsToProcess.map(job => this.processJob(job));
    await Promise.allSettled(promises);
  }

  /**
   * Process a single job
   */
  private async processJob(job: UserStatsUpdateJob): Promise<void> {
    const startTime = Date.now();

    try {
      if (this.config.enableLogging) {
        console.log(`🔄 Processing job: ${job.riotUserName}#${job.riotTagLine} (${job.priority} priority, attempt ${job.attempts + 1})`);
      }

      // Fetch and store user stats
      await fetchAndStoreUserStats({
        riotUserName: job.riotUserName,
        riotTagLine: job.riotTagLine,
        regionId: job.regionId,
      });

      // Mark job as completed
      userStatsUpdateQueue.complete(job.id);
      this.processedJobs++;
      this.lastProcessedAt = Date.now();

      const elapsed = Date.now() - startTime;
      if (this.config.enableLogging) {
        console.log(`✅ Completed job: ${job.riotUserName}#${job.riotTagLine} in ${elapsed}ms`);
      }

    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ Job failed: ${job.riotUserName}#${job.riotTagLine} after ${elapsed}ms:`, error);

      // Mark job as failed (will retry if attempts remain)
      userStatsUpdateQueue.fail(job.id, error as Error);
      this.failedJobs++;
    }
  }

  /**
   * Get worker statistics
   */
  getStats(): WorkerStats {
    return {
      isRunning: this.isRunning,
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs,
      queueStats: userStatsUpdateQueue.getStats(),
      uptimeMs: this.isRunning ? Date.now() - this.startTime : 0,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  /**
   * Check if worker is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Force process all pending jobs (for shutdown)
   */
  async flush(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🔄 Flushing remaining jobs before shutdown...');

    while (userStatsUpdateQueue.hasJobs()) {
      await this.processJobs();
      // Small delay to prevent busy waiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('✅ All jobs flushed');
  }
}

// Singleton instance
export const userStatsWorker = new UserStatsWorker({
  pollIntervalMs: 2000,
  maxConcurrentJobs: 5,
  enableLogging: true,
});

/**
 * Start the user stats worker
 */
export function startUserStatsWorker(): void {
  userStatsWorker.start();
}

/**
 * Stop the user stats worker
 */
export function stopUserStatsWorker(): Promise<void> {
  return new Promise(async (resolve) => {
    // Flush remaining jobs before stopping
    await userStatsWorker.flush();
    userStatsWorker.stop();
    resolve();
  });
}

/**
 * Get worker statistics
 */
export function getUserStatsWorkerStats(): WorkerStats {
  return userStatsWorker.getStats();
}
