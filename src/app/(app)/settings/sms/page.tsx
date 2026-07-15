import Link from "next/link";
import { Card, Input, Select, Button } from "@/components/ui";
import { SmsBadge, formatDuration } from "@/components/sms-badge";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import type { SmsMessage, SmsStats, ReceiptSnapshot } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** PostgREST or() filters use , and () as syntax — strip them from user input. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()"'\\%]/g, "").trim();
}

type Filters = { q?: string; status?: string; from?: string; to?: string; page?: string };

export default async function SmsDiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const { q: rawQ, status, from, to, page: rawPage } = await searchParams;
  const q = sanitizeSearch(rawQ ?? "");
  const page = Math.max(1, Number(rawPage) || 1);
  const supabase = await createClient();

  // ---- header stats (tolerates the migration not being applied yet) --------
  const statsResult = await supabase.rpc("sms_stats");
  const stats = (statsResult.error ? null : statsResult.data) as SmsStats | null;

  // ---- search: resolve tenant-name and receipt-number matches to ids -------
  const orClauses: string[] = [];
  if (q) {
    orClauses.push(`to_phone.ilike.*${q}*`, `provider_message_id.ilike.*${q}*`);
    const [{ data: tenantMatches }, { data: receiptMatches }] = await Promise.all([
      supabase.from("tenants").select("id").ilike("full_name", `%${q}%`).limit(50),
      supabase.from("receipts").select("payment_id").ilike("receipt_no", `%${q}%`).limit(50),
    ]);
    if (tenantMatches?.length) {
      orClauses.push(`tenant_id.in.(${tenantMatches.map((t) => t.id).join(",")})`);
    }
    if (receiptMatches?.length) {
      orClauses.push(`payment_id.in.(${receiptMatches.map((r) => r.payment_id).join(",")})`);
    }
  }

  // ---- main query -----------------------------------------------------------
  let query = supabase
    .from("sms_messages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status === "queue") query = query.in("status", ["pending", "sending", "retrying"]);
  else if (status === "sent" || status === "delivered" || status === "failed")
    query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", `${to}T23:59:59.999Z`);
  if (orClauses.length) query = query.or(orClauses.join(","));

  const { data: rowsData, count } = await query;
  const rows = (rowsData ?? []) as SmsMessage[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---- decorate rows with tenant names + receipts ---------------------------
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id))];
  const paymentIds = rows.map((r) => r.payment_id).filter((id): id is string => !!id);
  const [{ data: tenants }, { data: receipts }] = await Promise.all([
    tenantIds.length
      ? supabase.from("tenants").select("id,full_name").in("id", tenantIds)
      : Promise.resolve({ data: [] }),
    paymentIds.length
      ? supabase.from("receipts").select("payment_id,receipt_no,snapshot").in("payment_id", paymentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const tenantName = new Map((tenants ?? []).map((t) => [t.id as string, t.full_name as string]));
  const receiptByPayment = new Map(
    (receipts ?? []).map((r) => [
      r.payment_id as string,
      { no: r.receipt_no as string, snapshot: r.snapshot as ReceiptSnapshot },
    ])
  );

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/settings/sms${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-slate-500 hover:underline">
          ← Settings
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">SMS Diagnostics</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Every receipt SMS, its current state, and its full delivery timeline.
        </p>
      </div>

      {/* ---- live statistics ---- */}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Messages today" value={String(stats.today)} />
          <StatTile
            label={`Success rate (${stats.window_days}d)`}
            value={stats.success_rate != null ? `${stats.success_rate}%` : "—"}
          />
          <StatTile label="Awaiting confirmation" value={String(stats.sent_awaiting)} />
          <StatTile label="In queue" value={String(stats.in_queue)} />
          <StatTile label="Failed" value={String(stats.failed)} tone={stats.failed > 0 ? "bad" : undefined} />
          <StatTile label="Delivered" value={String(stats.delivered)} />
          <StatTile label="Retried" value={String(stats.retried)} />
          <StatTile label="Avg time to sent" value={formatDuration(stats.avg_accept_secs)} />
          <StatTile label="Avg confirmation" value={formatDuration(stats.avg_confirm_secs)} />
          <StatTile label="Avg total pipeline" value={formatDuration(stats.avg_total_secs)} />
        </div>
      ) : null}

      {/* ---- search & filters (plain GET form — works without JS) ---- */}
      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search tenant, phone, receipt no, message id"
              aria-label="Search"
              enterKeyHint="search"
            />
          </div>
          <Select name="status" defaultValue={status ?? ""} aria-label="Status filter">
            <option value="">All statuses</option>
            <option value="queue">In queue</option>
            <option value="sent">Sent — awaiting confirmation</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input name="from" type="date" defaultValue={from ?? ""} aria-label="From date" />
            <Input name="to" type="date" defaultValue={to ?? ""} aria-label="To date" />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" className="flex-1">
              Filter
            </Button>
            {(q || status || from || to) && (
              <Link href="/settings/sms" className="text-sm font-medium text-slate-500 hover:underline">
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      {/* ---- results ---- */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Messages</h2>
          <span className="text-xs text-slate-400">
            {total} result{total === 1 ? "" : "s"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No messages match.</p>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((m) => {
                const receipt = m.payment_id ? receiptByPayment.get(m.payment_id) : undefined;
                return (
                  <li key={m.id}>
                    <Link href={`/settings/sms/${m.id}`} className="block px-4 py-3.5 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-slate-900">
                          {tenantName.get(m.tenant_id) ?? m.to_phone}
                        </p>
                        <SmsBadge status={m.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {m.to_phone}
                        {receipt ? ` · ${receipt.no}` : ""}
                        {receipt ? ` · ${formatMoney(receipt.snapshot.amount_cents)}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDateTime(m.created_at)}
                        {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
                        {m.delivered_at
                          ? ` · delivered in ${formatDuration(secondsBetween(m.created_at, m.delivered_at))}`
                          : ""}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Tenant</th>
                    <th className="px-4 py-2 font-medium">Phone</th>
                    <th className="px-4 py-2 font-medium">Receipt</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 text-center font-medium">Attempts</th>
                    <th className="px-4 py-2 font-medium">Delivered in</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((m) => {
                    const receipt = m.payment_id ? receiptByPayment.get(m.payment_id) : undefined;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/settings/sms/${m.id}`}
                            className="font-medium text-slate-900 hover:text-brand hover:underline"
                          >
                            {tenantName.get(m.tenant_id) ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{m.to_phone}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{receipt?.no ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                          {receipt ? formatMoney(receipt.snapshot.amount_cents) : "—"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{formatDateTime(m.created_at)}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">{m.attempts}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {m.delivered_at ? formatDuration(secondsBetween(m.created_at, m.delivered_at)) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <SmsBadge status={m.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ---- pagination ---- */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="font-medium text-brand hover:underline">
                ← Newer
              </Link>
            ) : (
              <span className="text-slate-300">← Newer</span>
            )}
            <span className="text-xs text-slate-400">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="font-medium text-brand hover:underline">
                Older →
              </Link>
            ) : (
              <span className="text-slate-300">Older →</span>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${tone === "bad" ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
    </Card>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function secondsBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000;
}
