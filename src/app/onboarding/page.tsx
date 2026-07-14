import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import { JoinInviteBanner } from "./join-invite-banner";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already onboarded -> straight to the dashboard.
  const profile = await getProfile();
  if (profile) redirect("/dashboard");

  // A live invite addressed to this email? Offer to join instead of creating
  // a duplicate organization.
  const { data: pendingInvite } = await supabase.rpc("pending_invite_for_me");

  const metadata = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const prefillName = (metadata.full_name ?? metadata.name ?? "").trim();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <p className="mt-3 text-sm text-slate-500">Let&apos;s set up your account.</p>
        </div>
        {pendingInvite ? (
          <JoinInviteBanner
            orgName={String(pendingInvite.org_name ?? "an organization")}
            role={String(pendingInvite.role ?? "caretaker")}
          />
        ) : null}
        <Card className="p-6">
          {pendingInvite ? (
            <p className="mb-4 text-center text-xs uppercase tracking-wide text-slate-400">
              or create your own organization
            </p>
          ) : null}
          <OnboardingForm prefillName={prefillName} />
          <p className="mt-4 text-center text-xs text-slate-400">
            Joining an existing team? Open the invite link you were sent.
          </p>
        </Card>
      </div>
    </div>
  );
}
