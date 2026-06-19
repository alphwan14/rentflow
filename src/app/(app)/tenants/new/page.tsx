import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/profile";
import { periodFromDate } from "@/lib/ledger/period";
import { NewTenantForm } from "./new-tenant-form";

export default async function NewTenantPage() {
  const profile = await getProfile();
  if (profile?.role !== "admin") redirect("/dashboard");

  const now = new Date();
  const today = `${periodFromDate(now)}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Add tenant</h1>
      <Card className="p-6">
        <NewTenantForm today={today} />
      </Card>
    </div>
  );
}
