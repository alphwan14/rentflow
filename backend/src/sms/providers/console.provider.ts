import { Logger } from "@nestjs/common";
import type { SmsProvider, SmsSendResult } from "./sms-provider.interface";

/**
 * Dev/no-credentials provider: logs the message instead of sending. Lets the
 * whole queue pipeline run end-to-end locally without a real gateway.
 */
export class ConsoleProvider implements SmsProvider {
  readonly name = "console";
  private readonly logger = new Logger("ConsoleSmsProvider");

  async send(to: string, message: string): Promise<SmsSendResult> {
    this.logger.log(`[SMS -> ${to}]\n${message}`);
    return {
      success: true,
      providerMessageId: `console-${Date.now()}`,
      raw: { simulated: true },
    };
  }
}
