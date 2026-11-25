import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/admin";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · RentFlow admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireStaff();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-sidebar text-white md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-5 md:py-6">
          <div>
            <div className="text-[17px] font-semibold">RentFlow</div>
            <div className="text-[13px] text-white/60">Staff admin</div>
          </div>
          <Link href="/home" className="flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] text-white/80 hover:bg-white/10 md:mt-4 md:w-full">
            Switch to landlord app →
          </Link>
        </div>
        <AdminNav />
        <div className="mt-auto hidden px-5 py-6 text-[13px] text-white/50 md:block">{session.email}</div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 md:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
