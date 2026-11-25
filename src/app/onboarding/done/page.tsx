import type { Metadata } from "next";
import { formatKES } from "@/core/money";
import { getLeases, getUpload } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, List, ListRow, MoneyText, StatusPill } from "@/ui";
import { leaseStatus } from "@/app/(app)/_parts/status";

export const metadata: Metadata = { title: "Your tenants owe you" };

/** The reveal: how much is owed and by whom. */
export default async function OnboardingDone({ searchParams }: PageProps<"/onboarding/done">) {
  const s = await requireOrg();
  const { b, u } = await searchParams;
  const db = await supabaseServer();
  const buildingId = typeof b === "string" && b ? b : null;
  const [leases, upload] = await Promise.all([getLeases(db, s.org.orgId, buildingId), typeof u === "string" ? getUpload(db, u) : Promise.resolve(null)]);
  const owing = leases.filter((l) => l.balance_cents > 0).sort((a, c) => c.balance_cents - a.balance_cents);
  const owed = owing.reduce((t, l) => t + l.balance_cents, 0);
  const help = upload ? upload.events.filter((e) => e.status === "suggested" || e.status === "unmatched").length : 0;
  const matched = upload ? upload.events.filter((e) => e.status === "matched").length : 0;

  return (
    <div className="fade-in">
      <p className="text-[15px] text-muted">All set</p>
      <h1 className="mt-1 text-[28px] leading-tight font-semibold sm:text-[32px]">
        {owed > 0 ? (
          <>
            Your tenants owe you <span className="money">{formatKES(owed)}</span>
          </>
        ) : (
          "Your tenants are all paid up"
        )}
      </h1>
      {upload && (
        <p className="mt-2 text-[15px] text-muted">
          We matched {matched} {matched === 1 ? "payment" : "payments"} from your statement.
          {help > 0 && ` ${help} need you to say who paid. You'll find them on your home screen.`}
        </p>
      )}

      {owing.length > 0 && (
        <Card className="mt-6">
          <List>
            {owing.map((l) => (
              <ListRow
                key={l.lease_id}
                lead={l.unit_code}
                title={l.tenant_name}
                end={
                  <>
                    <MoneyText cents={l.balance_cents} className="text-[15px]" />
                    <StatusPill status={leaseStatus(l)} />
                  </>
                }
              />
            ))}
          </List>
        </Card>
      )}

      <ButtonLink href="/home" size="lg" className="mt-6 w-full">
        Go to my home screen
      </ButtonLink>
    </div>
  );
}
