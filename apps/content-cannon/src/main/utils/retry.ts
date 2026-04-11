import log from 'electron-log';

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = 3,
  baseDelayMs: number = 5000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const is429 = error.message?.includes('429') || error.status === 429;
      const is5xx = error.status >= 500;

      if (attempt < maxRetries && (is429 || is5xx)) {
        // For 429, use longer delays (rate limit)
        const delay = is429
          ? baseDelayMs * Math.pow(2, attempt) // 5s, 10s, 20s
          : baseDelayMs * (attempt + 1);       // 5s, 10s, 15s

        log.warn(`${label}: ${is429 ? 'Rate limited' : 'Server error'} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}
