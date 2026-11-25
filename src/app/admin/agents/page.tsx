import type { Metadata } from "next";
import { formatDate } from "@/core/period";
import { requireStaff, type AdminAgent } from "@/server/admin";
import { Card, EmptyState, List, ListRow, PageTitle } from "@/ui";

export const metadata: Metadata = { title: "Agents" };

export default async function AdminAgents() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("admin_agents");
  const rows = (data ?? []) as AdminAgent[];
  return (
    <>
      <PageTitle sub="RentFlow staff and field agents, and the accounts each one set up.">Agents</PageTitle>
      <Card>
        {rows.length ? (
          <List>
            {rows.map((a) => (
              <ListRow
                key={a.user_id}
                title={a.full_name ?? a.email ?? "Agent"}
                sub={[a.email, `since ${formatDate(a.since.slice(0, 10))}`].filter(Boolean).join(" · ")}
                end={
                  <>
                    <span className="tnum text-[13px] font-medium">
                      {a.accounts_set_up} {a.accounts_set_up === 1 ? "account" : "accounts"}
                    </span>
                    <span className="tnum text-[13px] text-muted">{a.units_set_up} units</span>
                  </>
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState title="No agents yet" />
        )}
      </Card>
      <p className="mt-4 text-[13px] text-muted">To add an agent, add their user to the platform_admins table in Supabase.</p>
    </>
  );
}
