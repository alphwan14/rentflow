import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <p className="mt-3 text-sm text-slate-500">
            We&apos;ll email you a link to reset your password.
          </p>
        </div>
        <Card className="p-6">
          <ForgotPasswordForm />
        </Card>
      </div>
    </div>
  );
}
