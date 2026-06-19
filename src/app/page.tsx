import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  // Logged-in users go straight to the app; everyone else (and search crawlers)
  // sees the public landing page below.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const features = [
    {
      title: "A clear rent ledger",
      body: "Every payment is timestamped, numbered and traceable. No more receipt books or notebooks — just one tidy history per tenant.",
    },
    {
      title: "Instant SMS receipts",
      body: "The moment you record a payment, the tenant gets a professional SMS receipt — works for M-Pesa, cash or bank.",
    },
    {
      title: "Arrears & advance tracking",
      body: "See who's overdue and who's “covered until August” at a glance. Partial and advance payments are handled automatically.",
    },
    {
      title: "Printable statements",
      body: "Settle any dispute in seconds with a full, professional account statement for any tenant.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Brand />
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-brand-fg hover:bg-teal-800"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Digital rent ledger &amp; receipts for landlords in Kenya
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            RentFlow helps landlords and caretakers in Mombasa, Nairobi and across East Africa
            track rent, send SMS receipts, and settle disputes — no more lost receipt books or
            unclear balances.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-brand-fg hover:bg-teal-800"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Built for ordinary landlords — learn it in under 10 minutes.
          </p>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust / SEO copy */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Rent management built for Kenya
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              From a single apartment block in Mombasa to rentals across Nairobi and the wider
              East Africa region, RentFlow keeps every shilling accounted for. Track monthly rent,
              record M-Pesa, cash or bank payments, send instant SMS receipts, and always know who
              is in arrears and who has paid in advance.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row">
          <Brand size="sm" />
          <p>RentFlow — rent ledger &amp; receipts for landlords in Kenya. © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
