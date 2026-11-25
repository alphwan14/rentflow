"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { reminderSms, receiptSms } from "@/core/messages";
import { parseCents } from "@/core/money";
import { dueDateFor, periodOf, todayNairobi } from "@/core/period";
import { friendlyError } from "../errors";
import { getLeaseDetail } from "../queries";
import { requireOrg } from "../session";
import { supabaseServer } from "../supabase";
import type { ActionResult } from "../types";

const uuid = z.string().uuid();

/** Record rent paid in cash. Posts straight away and queues an SMS receipt. */
export async function recordCashPayment(leaseId: string, amount: string, paidOn: string, note: string): Promise<ActionResult> {
  await requireOrg();
  if (!uuid.safeParse(leaseId).success) return { ok: false, error: "Something went wrong. Please try again." };
  let cents: number | null;
  try {
    cents = parseCents(amount);
  } catch {
    return { ok: false, error: "Enter the amount in shillings, like 15,000." };
  }
  if (!cents || cents <= 0) return { ok: false, error: "Enter how much was paid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, error: "Choose the date it was paid." };

  const db = await supabaseServer();
  const { data: paymentId, error } = await db.rpc("record_cash_payment", { p_lease: leaseId, p_amount: cents, p_paid_on: paidOn, p_note: note.slice(0, 120) || null });
  if (error) return { ok: false, error: friendlyError(error) };

  // Receipt text from the new balance; queued for the SMS worker. A missing phone is not an error here.
  const d = await getLeaseDetail(db, leaseId);
  if (d && d.lease.phones.length) {
    await db.rpc("queue_message", {
      p_lease: leaseId,
      p_kind: "receipt",
      p_body: receiptSms({
        tenantName: d.lease.tenant_name,
        amountCents: cents,
        unitCode: d.lease.unit_code,
        buildingName: d.lease.building_name,
        period: periodOf(todayNairobi()),
        balanceAfterCents: d.lease.balance_cents,
      }),
      p_payment: paymentId,
    });
  }
  refresh();
  return { ok: true, message: "Payment saved." };
}

/** Queue an SMS reminder for one tenant. */
export async function sendReminder(leaseId: string): Promise<ActionResult> {
  await requireOrg();
  if (!uuid.safeParse(leaseId).success) return { ok: false, error: "Something went wrong. Please try again." };
  const db = await supabaseServer();
  const d = await getLeaseDetail(db, leaseId);
  if (!d) return { ok: false, error: "We couldn't find that tenant." };
  if (d.lease.balance_cents <= 0) return { ok: false, error: `${d.lease.tenant_name} doesn't owe anything right now.` };
  if (!d.lease.phones.length) return { ok: false, error: "This tenant has no phone number. Add one first." };
  const today = todayNairobi();
  const period = periodOf(today);
  const body = reminderSms({
    tenantName: d.lease.tenant_name,
    unitCode: d.lease.unit_code,
    period,
    dueDate: dueDateFor(period, d.lease.due_day),
    today,
    rentCents: d.lease.rent_cents,
    owedCents: d.lease.balance_cents,
    payTo: d.payTo,
  });
  const { error } = await db.rpc("queue_message", { p_lease: leaseId, p_kind: "reminder", p_body: body });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Reminder ready to send." };
}

/** End a tenancy and mark the unit empty. */
export async function moveOut(leaseId: string, date: string): Promise<ActionResult> {
  await requireOrg();
  if (!uuid.safeParse(leaseId).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Choose the move-out date." };
  const db = await supabaseServer();
  const { error } = await db.rpc("end_tenancy", { p_lease: leaseId, p_end_date: date });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Moved out. The unit is now empty." };
}
