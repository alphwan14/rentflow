"use server";

import { z } from "zod";
import { friendlyError } from "../errors";
import { requireOrg } from "../session";
import { supabaseServer } from "../supabase";
import type { ActionResult } from "../types";

const row = z.object({
  unitCode: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  phones: z.array(z.string().regex(/^254[17]\d{8}$/)).max(5),
  idNumber: z.string().trim().max(20).nullable(),
  rentCents: z.number().int().positive().nullable(),
  depositCents: z.number().int().nonnegative().nullable(),
  openingBalanceCents: z.number().int().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/**
 * Save the tenants the agent reviewed on the preview screen. Parsing and
 * per-row validation already ran in the browser (same core code); the server
 * re-checks the shape and the database re-checks units and permissions.
 */
export async function importTenants(buildingId: string, rows: unknown): Promise<ActionResult<{ count: number }>> {
  await requireOrg();
  const parsed = z.array(row).min(1, "Nothing to import").max(500).safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Some rows still have problems. Fix the highlighted cells first." };
  const db = await supabaseServer();
  const { data, error } = await db.rpc("import_tenants", {
    p_building: buildingId,
    p_rows: parsed.data.map((r) => ({
      unit_code: r.unitCode,
      full_name: r.name,
      phones: r.phones,
      id_number: r.idNumber,
      rent_cents: r.rentCents,
      deposit_cents: r.depositCents,
      opening_balance_cents: r.openingBalanceCents,
      start_date: r.startDate,
    })),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: { count: data as number } };
}
