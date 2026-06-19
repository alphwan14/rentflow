import { Module } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { SmsRepository } from "./sms.repository";
import { SmsWorkerService } from "./sms-worker.service";
import { SmsController } from "./sms.controller";
import { SMS_PROVIDER, type SmsProvider } from "./providers/sms-provider.interface";
import { AfricasTalkingProvider } from "./providers/africas-talking.provider";
import { ConsoleProvider } from "./providers/console.provider";

@Module({
  controllers: [SmsController],
  providers: [
    SmsRepository,
    SmsWorkerService,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): SmsProvider =>
        config.smsProvider === "africastalking"
          ? new AfricasTalkingProvider(config)
          : new ConsoleProvider(),
    },
  ],
})
export class SmsModule {}
