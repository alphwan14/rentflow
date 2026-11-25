import { ButtonLink } from "@/ui";
import { Wordmark } from "@/ui/brand";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4 sm:px-6">
      <header className="flex items-center justify-between">
        <Wordmark href="/" />
        <ButtonLink href="/login" variant="ghost">
          Sign in
        </ButtonLink>
      </header>
      <section className="fade-in flex flex-1 flex-col justify-center py-16">
        <h1 className="text-[32px] leading-tight font-semibold">Know who has paid rent, and who hasn&apos;t.</h1>
        <p className="mt-4 text-[17px] text-muted">
          Tenants keep paying into your own M-Pesa paybill. RentFlow matches each payment to the right tenant and shows you what is still owed. Your money never passes through us.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/signup" size="lg">
            Get started free
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary" size="lg">
            Sign in
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
