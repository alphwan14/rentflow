"use server";

import { redirect } from "next/navigation";
import { StatementFormatError } from "@/core/sources/types";
import { friendlyError } from "../errors";
import { EVENT_COLUMNS, matchAndApply } from "../matching";
import { requireOrg } from "../session";
import { parseStatementFile } from "../statements";
import { supabaseServer } from "../supabase";
import type { PaymentEventRow } from "../types";

export type UploadState = { error?: string; needsPassword?: boolean } | undefined;

/**
 * Statement upload: parse → store each transaction once → match → post sure
 * matches, park the rest in "Who paid this?" → show the result.
 */
export async function uploadStatement(_: UploadState, form: FormData): Promise<UploadState> {
  const s = await requireOrg();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your M-Pesa statement file first." };
  const buildingId = (form.get("building_id") as string) || null;
  const password = ((form.get("password") as string) || "").trim() || undefined;

  let parsed;
  try {
    parsed = await parseStatementFile(file, password);
  } catch (e) {
    if (e instanceof StatementFormatError) return { error: e.message, needsPassword: /password/i.test(e.message) };
    return { error: "We couldn't read that file. Try the Excel or CSV version of your M-Pesa statement." };
  }
  if (!parsed.payments.length) {
    return { error: "We didn't find any payments into your account in this statement. Check it's the right file." };
  }

  const db = await supabaseServer();
  const { data: ingest, error } = await db.rpc("ingest_statement", {
    p_org: s.org.orgId,
    p_building: buildingId,
    p_meta: {
      filename: file.name.slice(0, 200),
      format: parsed.format,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      skipped_lines: parsed.skipped.length,
    },
    p_events: parsed.payments.map((p) => ({
      trans_code: p.transCode,
      amount_cents: p.amountCents,
      occurred_at: p.occurredAt,
      payer_phone: p.payerPhone,
      payer_phone_masked: p.payerPhoneMasked,
      payer_name: p.payerName,
      account_ref: p.accountRef,
      raw: p.raw,
    })),
  });
  if (error) return { error: friendlyError(error) };
  const { upload_id, inserted } = ingest as { upload_id: string; inserted: { id: string }[] };

  if (inserted.length) {
    const { data: events, error: e2 } = await db
      .from("payment_events")
      .select(EVENT_COLUMNS)
      .in("id", inserted.map((i) => i.id));
    if (e2) return { error: friendlyError(e2) };
    try {
      await matchAndApply(db, s.org.orgId, (events ?? []) as PaymentEventRow[], upload_id);
    } catch (e) {
      // Payments are stored; matching can be re-run from the inbox.
      console.error("matching failed", e);
    }
  }
  redirect(form.get("onboarding") ? `/onboarding/done?b=${buildingId ?? ""}&u=${upload_id}` : `/payments/upload/${upload_id}`);
}
