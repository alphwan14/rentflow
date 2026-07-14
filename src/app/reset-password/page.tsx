import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Requires a session — the recovery link creates one via /auth/confirm
 * (verifyOtp), so users always arrive here signed in.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <p className="mt-3 text-sm text-slate-500">Choose a new password.</p>
        </div>
        <Card className="p-6">
          <ResetPasswordForm />
        </Card>
      </div>
    </div>
  );
}
