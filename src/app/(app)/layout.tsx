import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLink } from "@/components/brand";
import { getProfile } from "@/lib/auth/profile";
import { signOut } from "@/lib/auth/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <BrandLink />
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100"
            >
              Dashboard
            </Link>
            <Link
              href="/tenants"
              className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100"
            >
              Tenants
            </Link>
            <form action={signOut}>
              <button className="rounded-lg px-3 py-2 font-medium text-slate-500 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
