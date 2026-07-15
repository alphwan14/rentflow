/**
 * Nudge the SMS worker to process the queue NOW instead of waiting for its
 * next interval tick. Fired after a payment commits (via next/server `after`,
 * so it never delays the user's redirect).
 *
 * Why this exists: the worker runs inside a Render web service. On the free
 * plan the instance spins down when idle and its interval timer stops — queued
 * SMS then sit at "pending" until something wakes the service. This request
 * both wakes the instance AND triggers an immediate tick, so SMS processing
 * starts within seconds of the payment. The interval loop remains the safety
 * net; if this call fails for any reason the message still goes out on the
 * next tick. Failures are logged, never thrown.
 *
 * Requires env (server-only, set in Vercel):
 *   SMS_WORKER_URL          e.g. https://rentflow-backend.onrender.com
 *   SMS_WORKER_ADMIN_TOKEN  same value as the Render WORKER_ADMIN_TOKEN
 * Unset = feature off (no-op).
 */
export async function nudgeSmsWorker(): Promise<void> {
  const base = process.env.SMS_WORKER_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const token = process.env.SMS_WORKER_ADMIN_TOKEN ?? process.env.WORKER_ADMIN_TOKEN;
  if (!base || !token) return;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/sms/process`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      // Generous timeout: a sleeping Render free instance can take ~30-60s to
      // cold-start. after() runs post-response, so the user never waits on this.
      signal: AbortSignal.timeout(75_000),
      cache: "no-store",
    });
    const body = await res.text().catch(() => "");
    console.log(
      JSON.stringify({ event: "sms.nudge", status: res.status, body: body.slice(0, 200) })
    );
  } catch (e) {
    // A timeout here can still have woken the instance — its interval worker
    // takes over once booted.
    console.log(
      JSON.stringify({ event: "sms.nudge.failed", error: e instanceof Error ? e.message : String(e) })
    );
  }
}
