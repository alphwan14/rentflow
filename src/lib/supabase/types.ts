/**
 * Database types for the RentFlow schema. Hand-maintained to mirror
 * supabase/migrations. When the project is linked you can regenerate with:
 *   supabase gen types typescript --linked > src/lib/supabase/types.ts
 */

export type Role = "admin" | "staff";
export type TenantState = "active" | "inactive" | "vacating";
export type PaymentMethod = "cash" | "mpesa" | "bank" | "other";
export type SmsStatus =
  | "pending"
  | "sending"
  | "sent"
  | "retrying"
  | "delivered"
  | "failed";

export interface SmsMessage {
  id: string;
  org_id: string;
  tenant_id: string;
  payment_id: string | null;
  to_phone: string;
  body: string;
  status: SmsStatus;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  attempts: number;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface Org {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface RentalUnit {
  id: string;
  org_id: string;
  label: string;
  default_rent_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  org_id: string;
  unit_id: string | null;
  full_name: string;
  phone: string | null;
  monthly_rent_cents: number;
  due_day: number;
  move_in_date: string;
  notes: string | null;
  status: TenantState;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentCharge {
  id: string;
  org_id: string;
  tenant_id: string;
  period_month: string; // date (first of month)
  amount_cents: number;
  due_date: string;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  org_id: string;
  tenant_id: string;
  amount_cents: number;
  method: PaymentMethod;
  note: string | null;
  paid_at: string;
  recorded_by: string | null;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  org_id: string;
  tenant_id: string;
  entry_type: "charge" | "payment" | "adjustment" | "reversal";
  amount_cents: number;
  source_table: string;
  source_id: string;
  occurred_at: string;
  created_at: string;
}

export interface PaymentAllocation {
  id: string;
  org_id: string;
  tenant_id: string;
  payment_id: string;
  charge_id: string | null;
  amount_cents: number;
  created_at: string;
}

export interface ReceiptSnapshot {
  receipt_no: string;
  tenant_name: string;
  unit: string | null;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: string;
  balance_cents: number;
  arrears_cents: number;
  credit_cents: number;
  covered_until: string | null;
}

export interface Receipt {
  id: string;
  org_id: string;
  payment_id: string;
  receipt_no: string;
  snapshot: ReceiptSnapshot;
  created_at: string;
}

export interface TenantFinancials {
  balance: number;
  arrears: number;
  credit: number;
  covered_until: string | null;
  overdue_days: number;
}

export interface DashboardTenant {
  tenant_id: string;
  full_name: string;
  unit_label: string | null;
  phone: string | null;
  monthly_rent_cents: number;
  status: TenantState;
  balance: number;
  arrears: number;
  credit: number;
  covered_until: string | null;
  overdue_days: number;
}

export interface RecordPaymentResult {
  payment_id: string;
  receipt_no: string;
  snapshot: ReceiptSnapshot;
  balance: number;
  arrears: number;
  credit: number;
  covered_until: string | null;
}
