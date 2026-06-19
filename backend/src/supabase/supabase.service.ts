import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppConfigService } from "../config/app-config.service";

/**
 * Supabase client authenticated with the SERVICE ROLE key. This bypasses RLS —
 * the worker is system infrastructure, not a user. It must only ever touch
 * operational tables (sms_messages); it never writes financial tables.
 */
@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor(config: AppConfigService) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}
