// concurrent.ts - Concurrency control utilities

/**
 * Process items with controlled concurrency
 * 
 * @param items - Array of items to process
 * @param concurrency - Maximum number of concurrent operations
 * @param fn - Async function to process each item
 * @returns Array of results in same order as input
 */
export async function pLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing: Promise<void>[] = [];
  
  let index = 0;
  
  for (const item of items) {
    const currentIndex = index++;
    
    const promise = (async () => {
      results[currentIndex] = await fn(item, currentIndex);
    })();
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      for (let i = executing.length - 1; i >= 0; i--) {
        if (await Promise.race([executing[i], Promise.resolve('done')]) === 'done') {
          executing.splice(i, 1);
        }
      }
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * Process items in batches
 * 
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param fn - Async function to process each batch
 * @param delayMs - Delay between batches (optional)
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (batch: T[], batchIndex: number) => Promise<R[]>,
  delayMs: number = 0
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    
    console.log(`  Processing batch ${batchIndex + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)...`);
    
    const batchResults = await fn(batch, batchIndex);
    results.push(...batchResults);
    
    // Delay between batches (except for last batch)
    if (delayMs > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`  ⚠ Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retries failed');
}

