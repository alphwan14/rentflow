import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already onboarded -> straight to the dashboard.
  const profile = await getProfile();
  if (profile) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <p className="mt-3 text-sm text-slate-500">Let&apos;s set up your account.</p>
        </div>
        <Card className="p-6">
          <OnboardingForm />
        </Card>
      </div>
    </div>
  );
}
