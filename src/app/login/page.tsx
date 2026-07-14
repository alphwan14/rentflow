import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <p className="mt-3 text-sm text-slate-500">
            Sign in to your rent ledger.
          </p>
        </div>
        <Card className="p-6">
          <LoginForm next={next ?? null} urlError={error ?? null} />
        </Card>
      </div>
    </div>
  );
}
