import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/core/period";
import { getBuildings, getUploads } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ORG_ID as DEMO_ORG_ID } from "@/demo/data";
import { Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/ui";
import { IconChevronRight } from "@/ui/icons";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Statements" };

export default async function StatementsPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [buildings, uploads] = await Promise.all([getBuildings(db, s.org.orgId), getUploads(db, s.org.orgId)]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Statements"
        sub="Until live M-Pesa notifications are connected, upload a statement each month to keep everything current."
        action={
          s.org.orgId === DEMO_ORG_ID ? (
            <a href="/statements/sample" className={buttonClass("secondary", "sm")} download>
              Download a sample statement
            </a>
          ) : null
        }
      />
      {buildings.length ? (
        <UploadForm buildings={buildings.map((b) => ({ id: b.id, name: b.name }))} />
      ) : (
        <Card>
          <EmptyState title="Set up a building first" />
        </Card>
      )}
      <Card>
        <CardHeader title="Uploaded" />
        {uploads.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {uploads.map((u) => (
              <li key={u.id}>
                <Link href={`/statements/${u.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-page/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{u.filename}</div>
                    <div className="text-[12px] text-muted">
                      {u.period_start ? `${formatDate(u.period_start)} – ${formatDate(u.period_end)}` : u.format} · uploaded {formatDate(u.created_at.slice(0, 10))}
                    </div>
                  </div>
                  <div className="num hidden text-right text-[12px] text-ink-2 sm:block">
                    {u.auto_matched} matched · {u.suggested + u.unmatched} to check · {u.duplicate_events} already seen
                  </div>
                  <IconChevronRight size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No statements yet" />
        )}
      </Card>
    </div>
  );
}
