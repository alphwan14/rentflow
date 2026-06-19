import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <p className="mt-3 text-sm text-slate-500">
            Organize your rent in under 10 minutes.
          </p>
        </div>
        <Card className="p-6">
          <SignupForm />
        </Card>
      </div>
    </div>
  );
}
