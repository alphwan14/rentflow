import { statusFromBalance, type PayStatus } from "@/core/ledger";
import type { LeaseOverview } from "@/server/types";

export function leaseStatus(l: Pick<LeaseOverview, "balance_cents" | "paid_this_month_cents">): PayStatus {
  return statusFromBalance(l.balance_cents, l.paid_this_month_cents);
}

export const SOURCE_LABEL: Record<string, string> = {
  mpesa_statement: "M-Pesa statement",
  daraja_c2b: "Paybill",
  kcb_buni: "Bank",
  cash: "Cash",
  manual: "Recorded by hand",
};

/** People a payment can be assigned to: current tenants, then past tenants who still owe. */
export function tenantOptions(current: LeaseOverview[], pastOwing: LeaseOverview[] = []) {
  return [
    ...current.map((l) => ({ leaseId: l.lease_id, unitCode: l.unit_code, name: l.tenant_name, buildingId: l.building_id })),
    ...pastOwing.map((l) => ({ leaseId: l.lease_id, unitCode: `${l.unit_code} (moved out)`, name: l.tenant_name, buildingId: l.building_id })),
  ];
}
