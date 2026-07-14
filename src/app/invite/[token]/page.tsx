import Link from "next/link";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";
import { AuthDivider } from "@/components/auth-divider";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/profile";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/invites/token";
import { roleLabel } from "@/lib/auth/permissions";
import { signOut } from "@/lib/auth/actions";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

type Preview = {
  status: "valid" | "expired" | "revoked" | "accepted" | "not_found";
  org_id?: string;
  org_name?: string;
  inviter_name?: string | null;
  role?: string;
};

const DEAD_MESSAGES: Record<string, string> = {
  not_found: "This invite link is not valid. Ask your organization for a new one.",
  expired: "This invite has expired. Ask your organization to send a new one.",
  revoked: "This invite was canceled by the organization.",
  accepted: "This invite has already been used. If that was you, just sign in.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let preview: Preview = { status: "not_found" };
  if (looksLikeInviteToken(token)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("invite_preview", {
      p_token_hash: hashInviteToken(token),
    });
    if (data?.status) preview = data as Preview;
  }

  const profile = await getProfile();
  const nextPath = `/invite/${token}`;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Brand size="lg" />
        </div>
        <Card className="p-6">
          {preview.status !== "valid" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">{DEAD_MESSAGES[preview.status]}</p>
              <Link href="/login" className="text-sm font-medium text-brand hover:underline">
                Go to sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-slate-500">
                  {preview.inviter_name?.trim() || "A teammate"} invited you to join
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{preview.org_name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  as <span className="font-medium text-slate-700">{roleLabel(preview.role)}</span>
                </p>
              </div>

              {profile && profile.org_id === preview.org_id ? (
                // Signed in and already a member of this very organization.
                <div className="space-y-3 text-center">
                  <p className="text-sm text-slate-600">
                    You&apos;re already a member of {preview.org_name}.
                  </p>
                  <Link
                    href="/dashboard"
                    className="block w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-teal-800"
                  >
                    Go to dashboard
                  </Link>
                </div>
              ) : profile ? (
                // Signed in AND already in a different org.
                <div className="space-y-3 text-center">
                  <p className="text-sm text-slate-600">
                    Your account already belongs to another organization, so it can&apos;t accept
                    this invite. Sign out and continue with a different account.
                  </p>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Sign out
                    </button>
                  </form>
                  <Link href="/dashboard" className="block text-sm font-medium text-brand hover:underline">
                    Back to my dashboard
                  </Link>
                </div>
              ) : (
                <SignedOutOrNoProfile token={token} nextPath={nextPath} />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

async function SignedOutOrNoProfile({ token, nextPath }: { token: string; nextPath: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Signed in, no profile yet: one tap to join.
    return <JoinForm token={token} />;
  }

  return (
    <div className="space-y-4">
      <GoogleButton next={nextPath} />
      <AuthDivider />
      <div className="space-y-2 text-center text-sm text-slate-500">
        <p>
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="font-medium text-brand hover:underline"
          >
            Create an account with email
          </Link>
        </p>
        <p>
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="font-medium text-brand hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
