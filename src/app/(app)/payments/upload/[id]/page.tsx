import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeases, getUpload } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, PageTitle } from "@/ui";
import { WhoPaidCards } from "../../../_parts/who-paid";

export const metadata: Metadata = { title: "Statement uploaded" };

export default async function UploadResult({ params }: PageProps<"/payments/upload/[id]">) {
  const s = await requireOrg();
  const { id } = await params;
  const db = await supabaseServer();
  const res = await getUpload(db, id);
  if (!res) notFound();
  const { upload, events } = res;
  const leases = await getLeases(db, s.org.orgId);
  const open = events.filter((e) => e.status === "suggested" || e.status === "unmatched" || e.status === "pending");
  const matched = events.filter((e) => e.status === "matched").length;

  return (
    <div className="fade-in mx-auto max-w-2xl">
      <PageTitle back={{ href: "/payments", label: "Payments" }}>Statement uploaded</PageTitle>
      <Card className="p-6">
        <p className="text-[20px] leading-snug font-semibold">
          Matched {matched} {matched === 1 ? "payment" : "payments"}.
          {open.length > 0 ? ` ${open.length} ${open.length === 1 ? "needs" : "need"} your help.` : " Nothing needs your help."}
        </p>
        <p className="mt-2 text-[15px] text-muted">
          {upload.duplicate_events > 0 && `${upload.duplicate_events} ${upload.duplicate_events === 1 ? "payment was" : "payments were"} already in RentFlow and weren't counted again. `}
          {upload.skipped_lines > 0 && `${upload.skipped_lines} other ${upload.skipped_lines === 1 ? "line" : "lines"} (charges and withdrawals) were left out.`}
        </p>
        {open.length === 0 && (
          <ButtonLink href="/home" className="mt-5">
            Go to home
          </ButtonLink>
        )}
      </Card>
      {open.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-[15px] font-semibold">Who paid these?</h2>
          <WhoPaidCards events={open} tenants={leases.map((l) => ({ leaseId: l.lease_id, unitCode: l.unit_code, name: l.tenant_name, buildingId: l.building_id }))} />
        </div>
      )}
    </div>
  );
}
