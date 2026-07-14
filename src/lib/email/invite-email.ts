/**
 * Optional invite email via Resend. Entirely additive: if RESEND_API_KEY is
 * not configured the feature is off and the share-link flow carries the
 * invite. Failures are non-fatal — the admin always gets the copyable link.
 */

export function inviteEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendInviteEmail(params: {
  to: string;
  orgName: string;
  inviterName: string | null;
  role: string;
  inviteUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "email not configured" };

  const from = process.env.INVITE_EMAIL_FROM ?? "RentFlow <onboarding@resend.dev>";
  const inviter = params.inviterName?.trim() || "A teammate";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: `${inviter} invited you to ${params.orgName} on RentFlow`,
        text:
          `${inviter} invited you to join ${params.orgName} on RentFlow as ${params.role}.\n\n` +
          `Open this link to accept the invitation:\n${params.inviteUrl}\n\n` +
          `The link expires in 7 days. If you weren't expecting this, you can ignore this email.`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "network error" };
  }
}
