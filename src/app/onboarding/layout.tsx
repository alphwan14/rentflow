import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { Wordmark } from "@/ui/brand";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login?next=/onboarding");
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Wordmark href={s.org ? "/home" : "/onboarding"} />
        {s.org && (
          <Link href="/home" className="flex min-h-11 items-center text-[15px] text-muted hover:text-ink">
            Finish later
          </Link>
        )}
      </header>
      <main className="fade-in pt-4">{children}</main>
    </div>
  );
}
