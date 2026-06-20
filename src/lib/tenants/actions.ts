"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/profile";
import { toCents } from "@/lib/ledger/money";
import { normalizeKenyanPhone } from "@/lib/phone";

export type FormState = { error: string } | null;

/**
 * [SMS DEBUG] Project ref = the subdomain of the Supabase URL this runtime uses.
 * Printed in Vercel function logs so production's target project can be compared
 * against the Render backend's SUPABASE_URL and the project you inspect.
 * A mismatch is the root cause of "receipt created but no sms_messages row".
 */
function supabaseProjectRef(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0] || "UNSET";
  } catch {
    return "INVALID_URL";
  }
}

/** Find-or-create a rental unit by label within the org; returns its id (or null). */
async function resolveUnitId(label: string): Promise<string | null> {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const supabase = await createClient();
  const profile = await getProfile();
  if (!profile) return null;

  await supabase
    .from("rental_units")
    .upsert({ org_id: profile.org_id, label: trimmed }, { onConflict: "org_id,label", ignoreDuplicates: true });

  const { data } = await supabase
    .from("rental_units")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("label", trimmed)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

export async function createTenant(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (profile.role !== "admin") return { error: "Only admins can add tenants." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const unitLabel = String(formData.get("unit_label") ?? "").trim();
  const rentKes = Number(formData.get("monthly_rent") ?? 0);
  const dueDay = Number(formData.get("due_day") ?? 1);
  const moveIn = String(formData.get("move_in_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!fullName) return { error: "Tenant name is required." };
  if (!(rentKes > 0)) return { error: "Monthly rent must be greater than zero." };
  if (!moveIn) return { error: "Move-in date is required." };
  if (dueDay < 1 || dueDay > 31) return { error: "Due day must be between 1 and 31." };

  // Standardize the phone to E.164 before it can ever reach the SMS queue.
  let normalizedPhone: string | null = null;
  if (phone) {
    const { e164, recognized } = normalizeKenyanPhone(phone);
    if (!recognized) {
      return {
        error: "Enter a valid Kenyan phone number, e.g. 0756528219 or +254756528219.",
      };
    }
    normalizedPhone = e164;
  }

  const supabase = await createClient();
  const unitId = unitLabel ? await resolveUnitId(unitLabel) : null;

  const { data, error } = await supabase
    .from("tenants")
    .insert({
      org_id: profile.org_id,
      unit_id: unitId,
      full_name: fullName,
      phone: normalizedPhone,
      monthly_rent_cents: toCents(rentKes),
      due_day: dueDay,
      move_in_date: moveIn,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Generate charges from move-in through today immediately.
  await supabase.rpc("sync_charges", { p_tenant: data.id });

  redirect(`/tenants/${data.id}`);
}

export async function recordPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const amountKes = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim();
  const paidAt = String(formData.get("paid_at") ?? "").trim();

  if (!tenantId) return { error: "Missing tenant." };
  if (!(amountKes > 0)) return { error: "Enter an amount greater than zero." };

  const supabase = await createClient();

  // [SMS DEBUG] Which Supabase project is this server action writing to?
  const projectRef = supabaseProjectRef();
  console.log(JSON.stringify({ event: "sms.enqueue.attempt", projectRef, tenantId }));

  const { data, error } = await supabase.rpc("record_payment", {
    p_tenant: tenantId,
    p_amount: toCents(amountKes),
    p_method: method,
    p_note: note || null,
    p_paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
  });

  if (error) {
    console.log(
      JSON.stringify({ event: "sms.enqueue.skipped_reason", projectRef, reason: "record_payment_rpc_error", detail: error.message })
    );
    return { error: error.message };
  }

  const paymentId = (data as { payment_id?: string })?.payment_id;

  // [SMS DEBUG] record_payment commits the receipt AND the sms row in one
  // transaction. Read the row back (RLS allows org-scoped sms_messages selects)
  // to prove whether the enqueue actually landed in THIS project.
  if (paymentId) {
    const { data: sms } = await supabase
      .from("sms_messages")
      .select("id,status,to_phone")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (sms) {
      console.log(
        JSON.stringify({ event: "sms.enqueue.success", projectRef, paymentId, smsId: sms.id, to: sms.to_phone })
      );
    } else {
      console.log(
        JSON.stringify({
          event: "sms.enqueue.skipped_reason",
          projectRef,
          paymentId,
          reason: "no_sms_row_for_payment — tenant phone blank, OR this project differs from the one the worker drains",
        })
      );
    }
  }

  revalidatePath(`/tenants/${tenantId}`);
  redirect(paymentId ? `/receipts/${paymentId}` : `/tenants/${tenantId}`);
}
