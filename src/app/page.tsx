import { ButtonLink } from "@/ui";
import { Brand } from "@/ui/brand";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Brand href="/" />
        <ButtonLink href="/login" variant="secondary" size="sm">
          Sign in
        </ButtonLink>
      </header>
      <section className="flex flex-1 flex-col justify-center py-16">
        <h1 className="max-w-xl text-[36px] leading-[1.1] font-semibold tracking-tight sm:text-[48px]">Know where every shilling of rent is.</h1>
        <p className="mt-4 max-w-lg text-[17px] text-ink-2">
          Tenants keep paying into your own paybill. RentFlow reads the payments, matches each one to a tenant, and shows who still owes,
          without ever holding your money.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Get started</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            I have an account
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
