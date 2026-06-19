export interface SmsSendResult {
  success: boolean;
  /** Provider's message id when accepted (for delivery tracking). */
  providerMessageId?: string;
  /** Human-readable reason on failure. */
  errorMessage?: string;
  /** Raw provider response, stored for auditing/debugging. */
  raw?: unknown;
}

/**
 * Provider abstraction so SMS gateways are swappable (Africa's Talking today,
 * Twilio/others later) without touching the worker or queue logic.
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, message: string): Promise<SmsSendResult>;
}

/** DI token for the active SmsProvider. */
export const SMS_PROVIDER = Symbol("SMS_PROVIDER");
