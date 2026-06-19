import { Logger } from "@nestjs/common";
import type { AppConfigService } from "../../config/app-config.service";
import { normalizeKenyanPhone } from "../phone";
import type { SmsProvider, SmsSendResult } from "./sms-provider.interface";

interface AtRecipient {
  number?: string;
  status?: string;
  statusCode?: number;
  messageId?: string;
  cost?: string;
}
interface AtResponse {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AtRecipient[];
  };
}

// Production endpoint only. No sandbox/simulation path exists in the runtime.
const PRODUCTION_URL = "https://api.africastalking.com/version1/messaging";

/**
 * Africa's Talking SMS provider — PRODUCTION. Talks to the live REST API via
 * fetch (no SDK). A custom alphanumeric sender id (AT_FROM) is included only
 * when configured and must be a registered/approved id; otherwise AT delivers
 * from the account default.
 *
 * Send result semantics:
 *   - success = recipient came back "Success" (statusCode 101) = ACCEPTED by AT.
 *     This is acceptance, not handset delivery — true delivery is confirmed
 *     asynchronously via the /sms/delivery-report webhook.
 *   - any transport error or non-success status is a retryable failure.
 */
export class AfricasTalkingProvider implements SmsProvider {
  readonly name = "africastalking";
  private readonly logger = new Logger("AfricasTalkingProvider");
  private readonly includeSender: boolean;

  constructor(private readonly config: AppConfigService) {
    this.includeSender = !!config.at.from;
    this.logger.log(
      JSON.stringify({
        event: "sms.provider.init",
        mode: "production",
        endpoint: PRODUCTION_URL,
        senderId: this.includeSender ? config.at.from : "(account default)",
      })
    );
  }

  async send(to: string, message: string): Promise<SmsSendResult> {
    // AT requires E.164 (+2547XXXXXXXX). Numbers are normalized at enqueue too;
    // this is defense-in-depth for any caller.
    const { e164, recognized } = normalizeKenyanPhone(to);
    if (!recognized) {
      this.logger.warn(
        JSON.stringify({ event: "sms.phone.unrecognized", to, normalized: e164 })
      );
    }

    const body = new URLSearchParams({
      username: this.config.at.username,
      to: e164,
      message,
    });
    if (this.includeSender) body.set("from", this.config.at.from!);

    this.logger.log(
      JSON.stringify({
        event: "sms.send.attempt",
        to: e164,
        senderId: this.includeSender ? this.config.at.from : "(default)",
        messageLength: message.length,
      })
    );

    try {
      const res = await fetch(PRODUCTION_URL, {
        method: "POST",
        headers: {
          apiKey: this.config.at.apiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      const json = (await res.json().catch(() => null)) as AtResponse | null;
      const recipient = json?.SMSMessageData?.Recipients?.[0];

      if (!res.ok) {
        const errorMessage = `HTTP ${res.status}: ${json?.SMSMessageData?.Message ?? res.statusText}`;
        this.logger.warn(JSON.stringify({ event: "sms.send.http_error", to: e164, errorMessage }));
        return { success: false, errorMessage, raw: json ?? { httpStatus: res.status } };
      }

      if (recipient && (recipient.status === "Success" || recipient.statusCode === 101)) {
        this.logger.log(
          JSON.stringify({
            event: "sms.send.accepted",
            to: e164,
            messageId: recipient.messageId,
            cost: recipient.cost,
            statusCode: recipient.statusCode,
          })
        );
        return { success: true, providerMessageId: recipient.messageId, raw: json };
      }

      const errorMessage =
        recipient?.status ?? json?.SMSMessageData?.Message ?? "Unknown provider response";
      this.logger.warn(
        JSON.stringify({ event: "sms.send.rejected", to: e164, errorMessage, statusCode: recipient?.statusCode })
      );
      return { success: false, errorMessage, raw: json };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(JSON.stringify({ event: "sms.send.transport_error", to: e164, errorMessage }));
      return { success: false, errorMessage, raw: { error: errorMessage } };
    }
  }
}
