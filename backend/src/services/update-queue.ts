// Update Queue System for User Stats Background Processing

export interface UserStatsUpdateJob {
  id: string;
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
  isCurrentUser?: boolean;
  priority: 'immediate' | 'high' | 'low';
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: number;
}

export interface QueueStats {
  totalJobs: number;
  immediateJobs: number;
  highPriorityJobs: number;
  lowPriorityJobs: number;
  processingJobs: number;
}

class UserStatsUpdateQueue {
  private jobs = new Map<string, UserStatsUpdateJob>();
  private processing = new Set<string>();
  private readonly maxConcurrentJobs = 5;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000; // 1 second base delay

  /**
   * Add a job to the queue with deduplication
   */
  enqueue(params: {
    riotUserName: string;
    riotTagLine: string;
    regionId: string;
    isCurrentUser?: boolean;
    priority?: 'immediate' | 'high' | 'low';
  }): string {
    const jobId = this.makeJobId(params.riotUserName, params.riotTagLine, params.regionId);
    
    // If job already exists and is higher priority, don't replace
    const existing = this.jobs.get(jobId);
    if (existing && this.getPriorityWeight(existing.priority) >= this.getPriorityWeight(params.priority || 'low')) {
      return jobId;
    }

    const job: UserStatsUpdateJob = {
      id: jobId,
      riotUserName: params.riotUserName,
      riotTagLine: params.riotTagLine,
      regionId: params.regionId,
      isCurrentUser: params.isCurrentUser,
      priority: params.priority || 'low',
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: this.maxRetries,
    };

    this.jobs.set(jobId, job);
    console.log(`📝 Queued user stats update: ${params.riotUserName}#${params.riotTagLine} (${params.priority || 'low'} priority)`);
    
    return jobId;
  }

  /**
   * Get next job to process, ordered by priority
   */
  dequeue(): UserStatsUpdateJob | null {
    if (this.processing.size >= this.maxConcurrentJobs) {
      return null;
    }

    const availableJobs = Array.from(this.jobs.values())
      .filter(job => !this.processing.has(job.id))
      .sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityDiff = this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt - b.createdAt;
      });

    if (availableJobs.length === 0) {
      return null;
    }

    const job = availableJobs[0];
    this.processing.add(job.id);
    return job;
  }

  /**
   * Mark job as completed and remove from queue
   */
  complete(jobId: string): void {
    this.jobs.delete(jobId);
    this.processing.delete(jobId);
  }

  /**
   * Mark job as failed and schedule retry if attempts remain
   */
  fail(jobId: string, error: Error): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.attempts++;
    job.lastAttemptAt = Date.now();

    if (job.attempts >= job.maxAttempts) {
      console.error(`❌ Job ${jobId} failed permanently after ${job.attempts} attempts:`, error.message);
      this.jobs.delete(jobId);
    } else {
      console.warn(`⚠️ Job ${jobId} failed (attempt ${job.attempts}/${job.maxAttempts}), will retry:`, error.message);
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = this.retryDelayMs * Math.pow(2, job.attempts - 1);
      setTimeout(() => {
        this.processing.delete(jobId);
      }, delayMs);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const jobs = Array.from(this.jobs.values());
    return {
      totalJobs: jobs.length,
      immediateJobs: jobs.filter(j => j.priority === 'immediate').length,
      highPriorityJobs: jobs.filter(j => j.priority === 'high').length,
      lowPriorityJobs: jobs.filter(j => j.priority === 'low').length,
      processingJobs: this.processing.size,
    };
  }

  /**
   * Clear all jobs (for shutdown)
   */
  clear(): void {
    this.jobs.clear();
    this.processing.clear();
  }

  /**
   * Check if queue has any jobs
   */
  hasJobs(): boolean {
    return this.jobs.size > 0 || this.processing.size > 0;
  }

  private makeJobId(riotUserName: string, riotTagLine: string, regionId: string): string {
    return `${regionId}:${riotUserName.toLowerCase()}#${riotTagLine}`;
  }

  private getPriorityWeight(priority: string): number {
    switch (priority) {
      case 'immediate': return 3;
      case 'high': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
}

// Singleton instance
export const userStatsUpdateQueue = new UserStatsUpdateQueue();

/**
 * Helper function to determine priority based on data staleness
 */
export function determinePriority(lastUpdatedAt: string | null): 'immediate' | 'high' | 'low' {
  if (!lastUpdatedAt) {
    return 'immediate'; // Missing data
  }

  const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (ageMs > TWENTY_FOUR_HOURS_MS) {
    return 'high'; // Expired data
  } else if (ageMs > ONE_HOUR_MS) {
    return 'low'; // Stale data
  } else {
    return 'low'; // Fresh data (shouldn't queue, but just in case)
  }
}
