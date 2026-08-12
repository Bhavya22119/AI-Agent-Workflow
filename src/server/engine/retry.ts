/**
 * Retry with exponential backoff for the two step types that call the outside
 * world (llm_call, http_request).
 *
 * `retry_limit` on the step is the number of *extra* attempts, so the default of
 * 1 means "try, and if it fails try once more". The runner reports every attempt
 * through onAttempt so step_runs.attempt_count is accurate live, which is what
 * makes a retry visible in the UI rather than something you have to take on
 * trust.
 */

export class RetryableError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly lastError: unknown,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export interface RetryOptions {
  /** Extra attempts after the first. */
  retries: number;
  /** Called before each attempt, 1-based. */
  onAttempt?: (attempt: number) => Promise<void> | void;
  baseDelayMs?: number;
  /** Return false to fail immediately without consuming retries. */
  isRetryable?: (error: unknown) => boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  { retries, onAttempt, baseDelayMs = 600, isRetryable }: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, retries + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await onAttempt?.(attempt);
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryable ? isRetryable(error) : true;
      if (!retryable || attempt === maxAttempts) break;
      // 600ms, 1200ms, 2400ms ... with a little jitter to avoid lockstep retries.
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 150);
      await sleep(delay);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new RetryableError(
    `Failed after ${maxAttempts} attempt${maxAttempts > 1 ? 's' : ''}: ${message}`,
    maxAttempts,
    lastError,
  );
}
