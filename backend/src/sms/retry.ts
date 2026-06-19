/**
 * Bounded exponential-ish backoff for SMS retries. Pure & deterministic so it
 * can be unit-tested. `attempt` is the number of attempts already made
 * (1 = after the first failure).
 */
const SCHEDULE_SECONDS = [60, 300, 900, 3600, 10800, 43200]; // 1m, 5m, 15m, 1h, 3h, 12h

export function backoffSeconds(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), SCHEDULE_SECONDS.length) - 1;
  return SCHEDULE_SECONDS[idx];
}

export function nextAttemptAt(attempt: number, now: Date): Date {
  return new Date(now.getTime() + backoffSeconds(attempt) * 1000);
}

/** Has this message exhausted its retry budget? */
export function isExhausted(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}
