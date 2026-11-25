import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { Brand } from "@/ui/brand";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login?next=/onboarding");
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <Brand href={s.org ? "/home" : "/onboarding"} />
        {s.org && (
          <Link href="/home" className="text-[14px] text-ink-2 hover:text-ink">
            Skip to home
          </Link>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
