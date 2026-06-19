import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { SmsModule } from "./sms/sms.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [AppConfigModule, SupabaseModule, SmsModule],
  controllers: [HealthController],
})
export class AppModule {}
