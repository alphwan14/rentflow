import "server-only";
import { notFound } from "next/navigation";
import { getSession } from "./session";
import { supabaseServer } from "./supabase";

/** Staff only. Anyone else gets a 404, so the admin's existence isn't revealed. */
export async function requireStaff() {
  const s = await getSession();
  if (!s?.isPlatformAdmin) notFound();
  return { session: s, db: await supabaseServer() };
}

export interface AdminLandlord {
  org_id: string;
  name: string;
  plan: "free" | "growth" | "pro";
  created_at: string;
  owner_email: string | null;
  owner_name: string | null;
  buildings: number;
  units: number;
  tenants: number;
  owed_cents: number;
  collected_this_month_cents: number;
  messages_this_month: number;
}

export interface AdminBuilding {
  building_id: string;
  org_id: string;
  org_name: string;
  name: string;
  location: string | null;
  created_at: string;
  units: number;
  filled: number;
  owed_cents: number;
  last_upload_at: string | null;
}

export interface AdminAgent {
  user_id: string;
  email: string | null;
  full_name: string | null;
  since: string;
  accounts_set_up: number;
  units_set_up: number;
}

export interface AdminSms {
  org_id: string;
  org_name: string;
  month: string;
  kind: string;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
}
