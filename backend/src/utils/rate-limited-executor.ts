// rate-limited-executor.ts - Smart rate limiting with concurrency control

export interface ExecutorMetrics {
  totalExecuted: number;
  successCount: number;
  failureCount: number;
  rateLimitHits: number;
  averageLatency: number;
  startTime: number;
}

export class RateLimitedExecutor {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private requestTimes: number[] = [];
  private metrics: ExecutorMetrics;
  
  constructor(
    private maxConcurrent: number,
    private maxPerMinute: number
  ) {
    this.metrics = {
      totalExecuted: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitHits: 0,
      averageLatency: 0,
      startTime: Date.now(),
    };
  }
  
  /**
   * Add a task to the execution queue
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        const taskStart = Date.now();
        
        try {
          // Wait for rate limit if needed
          await this.waitForRateLimit();
          
          // Execute the task
          const result = await fn();
          
          // Update metrics
          this.metrics.successCount++;
          this.updateLatency(Date.now() - taskStart);
          
          resolve(result);
        } catch (err) {
          this.metrics.failureCount++;
          reject(err);
        } finally {
          this.metrics.totalExecuted++;
          this.running--;
          this.processQueue();
        }
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Wait if rate limit would be exceeded
   */
  private async waitForRateLimit() {
    const now = Date.now();
    
    // Remove requests older than 1 minute
    this.requestTimes = this.requestTimes.filter(t => now - t < 60000);
    
    if (this.requestTimes.length >= this.maxPerMinute) {
      this.metrics.rateLimitHits++;
      
      const oldestRequest = this.requestTimes[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // +100ms buffer
      
      console.log(`  ⏱️  Rate limit: waiting ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
    
    this.requestTimes.push(Date.now());
  }
  
  /**
   * Process queued tasks up to concurrency limit
   */
  private processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      task();
    }
  }
  
  /**
   * Update average latency metric
   */
  private updateLatency(latency: number) {
    const total = this.metrics.averageLatency * (this.metrics.totalExecuted - 1);
    this.metrics.averageLatency = (total + latency) / this.metrics.totalExecuted;
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): ExecutorMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Print metrics summary
   */
  printMetrics() {
    const duration = (Date.now() - this.metrics.startTime) / 1000;
    const rate = this.metrics.totalExecuted / duration;
    
    console.log(`
📊 Executor Metrics:
   Duration: ${duration.toFixed(2)}s
   Executed: ${this.metrics.totalExecuted} (${rate.toFixed(2)}/s)
   Success: ${this.metrics.successCount}
   Failures: ${this.metrics.failureCount}
   Rate Limit Hits: ${this.metrics.rateLimitHits}
   Avg Latency: ${this.metrics.averageLatency.toFixed(0)}ms
    `);
  }
}

/**
 * Batch items into groups for processing
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

