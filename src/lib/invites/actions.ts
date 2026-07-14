"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/profile";
import { canManageTeam } from "@/lib/auth/permissions";
import { generateInviteToken, hashInviteToken, looksLikeInviteToken } from "@/lib/invites/token";
import { inviteEmailEnabled, sendInviteEmail } from "@/lib/email/invite-email";
import { siteUrl } from "@/lib/config";

export type InviteFormState =
  | { error: string }
  | { inviteUrl: string; emailStatus: "sent" | "failed" | "off" }
  | null;

/**
 * Create an invite: generate the raw token here (Node), store only its hash
 * via the create_invite RPC, and hand the one-time link back to the admin.
 * If Resend is configured and an email was given, also send it — non-fatally.
 */
export async function createInvite(
  _prev: InviteFormState,
  formData: FormData
): Promise<InviteFormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (!canManageTeam(profile.role)) {
    return { error: "Only owners and admins can invite staff." };
  }

  const role = String(formData.get("role") ?? "caretaker");
  const email = String(formData.get("email") ?? "").trim();
  if (!["admin", "caretaker", "viewer"].includes(role)) {
    return { error: "Choose a valid role." };
  }

  const rawToken = generateInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invite", {
    p_token_hash: hashInviteToken(rawToken),
    p_role: role,
    p_email: email || null,
  });
  if (error) return { error: error.message };

  const inviteUrl = `${siteUrl()}/invite/${rawToken}`;

  let emailStatus: "sent" | "failed" | "off" = "off";
  if (email && inviteEmailEnabled()) {
    const { data: org } = await supabase.from("orgs").select("name").maybeSingle();
    const result = await sendInviteEmail({
      to: email,
      orgName: org?.name ?? "your team",
      inviterName: profile.full_name,
      role,
      inviteUrl,
    });
    emailStatus = result.sent ? "sent" : "failed";
  }

  revalidatePath("/settings");
  return { inviteUrl, emailStatus };
}

export async function revokeInvite(inviteId: string): Promise<{ error: string } | void> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (!canManageTeam(profile.role)) {
    return { error: "Only owners and admins can revoke invites." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_invite: inviteId });
  if (error) return { error: error.message };
  revalidatePath("/settings");
}

export type AcceptState = { error: string } | null;

/** Accept via the raw token from the invite link. */
export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const rawToken = String(formData.get("token") ?? "");
  if (!looksLikeInviteToken(rawToken)) return { error: "This invite link is not valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", {
    p_token_hash: hashInviteToken(rawToken),
  });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

/** Accept the email-matched invite from the onboarding banner (no raw token). */
export async function acceptPendingInvite(): Promise<AcceptState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_pending_invite");
  if (error) return { error: error.message };

  redirect("/dashboard");
}
