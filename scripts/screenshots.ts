/**
 * Screenshots of every main screen at 360 px (cheap Android) and 1280 px.
 *
 *   npm run build && npx next start -p 3100   (in another terminal)
 *   npm run screenshots
 *
 * Signs in as the demo landlord. For the admin pages it creates a temporary
 * staff user with the service-role key and deletes it afterwards.
 * Uses the Edge or Chrome already installed (no browser download).
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { DEMO } from "../src/demo/data";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = join(__dirname, "..", "docs", "screenshots");
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(URL_).hostname.split(".")[0];

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function cookiesFor(session: Session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  const names = chunks.length === 1 ? [`sb-${REF}-auth-token`] : chunks.map((_, i) => `sb-${REF}-auth-token.${i}`);
  return names.map((name, i) => ({ name, value: chunks[i], domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const }));
}

async function signIn(email: string, password: string) {
  const db = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { db, session: data.session };
}

async function shoot(ctx: BrowserContext, name: string, path: string, width: number) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: width < 600 ? 780 : 860 });
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900); // let the home total finish counting up
  // Grow the viewport to the page height so the phone tab bar sits at the bottom of the image.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(height, width < 600 ? 780 : 860) });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `${name}-${width}.png`), fullPage: true });
  await page.close();
  console.log(`  ${name}-${width}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const executablePath = BROWSERS.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Edge or Chrome found. Set one in BROWSERS.");
  const browser = await chromium.launch({ executablePath, headless: true });

  // ── Landlord (demo) ──
  const { db, session } = await signIn(DEMO.email, DEMO.password);
  const { data: owing } = await db.from("lease_overview").select("lease_id").eq("unit_code", "B7").single();
  const { data: ahead } = await db.from("lease_overview").select("lease_id").eq("unit_code", "B15").single();
  const { data: b } = await db.from("buildings").select("id").limit(1).single();
  const { data: up } = await db.from("statement_uploads").select("id").order("created_at", { ascending: false }).limit(1).single();

  const landlord: [string, string][] = [
    ["01-home", "/home"],
    ["02-home-who-paid", "/home?tab=who-paid"],
    ["03-who-paid", "/payments/who-paid"],
    ["04-tenants", "/tenants"],
    ["05-tenant-owes", `/tenants/${owing!.lease_id}`],
    ["06-tenant-paid-ahead", `/tenants/${ahead!.lease_id}`],
    ["07-units", "/units"],
    ["08-payments", "/payments"],
    ["09-upload", "/payments/upload"],
    ["10-upload-result", `/payments/upload/${up!.id}`],
    ["11-add-tenants", `/units/add-tenants?b=${b!.id}`],
    ["12-settings", "/settings"],
    ["13-onboarding-1-building", "/onboarding"],
    ["14-onboarding-2-units", `/onboarding/units?b=${b!.id}`],
    ["15-onboarding-3-tenants", `/onboarding/tenants?b=${b!.id}`],
    ["16-onboarding-4-statement", `/onboarding/statement?b=${b!.id}`],
    ["17-onboarding-reveal", `/onboarding/done?b=${b!.id}`],
  ];
  const ctx = await browser.newContext();
  await ctx.addCookies(cookiesFor(session));
  for (const w of [360, 1280]) for (const [n, p] of landlord) await shoot(ctx, n, p, w);
  await ctx.close();

  // ── Signed out ──
  const anon = await browser.newContext();
  for (const w of [360, 1280])
    for (const [n, p] of [
      ["20-landing", "/"],
      ["21-sign-in", "/login"],
      ["22-sign-up", "/signup"],
      ["23-join", "/join/example"],
    ] as const)
      await shoot(anon, n, p, w);
  await anon.close();

  // ── Staff admin (temporary staff user) ──
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const email = `screenshots-${Date.now()}@rentflow.invalid`;
    const password = `Tmp-${crypto.randomUUID()}`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Field Agent" } });
    if (error || !created.user) throw error;
    try {
      const { error: e2 } = await admin.from("platform_admins").insert({ user_id: created.user.id });
      if (e2) throw e2;
      const staff = await signIn(email, password);
      const sctx = await browser.newContext();
      await sctx.addCookies(cookiesFor(staff.session));
      for (const w of [360, 1280])
        for (const [n, p] of [
          ["30-admin-landlords", "/admin"],
          ["31-admin-buildings", "/admin/buildings"],
          ["32-admin-plans", "/admin/plans"],
          ["33-admin-agents", "/admin/agents"],
          ["34-admin-sms", "/admin/sms"],
        ] as const)
          await shoot(sctx, n, p, w);
      await sctx.close();
    } finally {
      await admin.auth.admin.deleteUser(created.user.id);
      console.log("  temporary staff user removed");
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
