import Link from "next/link";
import { Brand } from "@/components/brand";

/**
 * Global not-found. Any dead link lands here instead of a bare 404 —
 * with a way back into the app. (Signed-out visitors following /dashboard
 * are redirected to /login by the proxy before rendering it.)
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Brand size="lg" />
        <h1 className="mt-6 text-lg font-semibold text-slate-900">
          This page doesn&apos;t exist anymore
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          It may have been moved or removed — for example, a deleted tenant&apos;s profile.
          Your payments, receipts and history are safe.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-teal-800"
          >
            Go to dashboard
          </Link>
          <Link
            href="/tenants"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View tenants
          </Link>
        </div>
      </div>
    </div>
  );
}
