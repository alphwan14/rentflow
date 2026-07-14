import { createHash, randomBytes } from "crypto";

/**
 * Invite tokens: 256 bits of entropy, URL-safe, shown exactly once in the
 * invite link. Only the sha256 hash is stored — the database never sees the
 * raw token. Pure functions so they are unit-testable.
 */

/** 43-char base64url token (32 random bytes). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hex sha256 of the raw token — the only form the database stores. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Sanity check before hitting the DB with obviously malformed input. */
export function looksLikeInviteToken(raw: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(raw);
}
