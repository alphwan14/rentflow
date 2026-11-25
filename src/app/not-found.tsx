import { ButtonLink } from "@/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-[20px] font-semibold">We can&apos;t find that page</h1>
      <p className="mt-1 text-[15px] text-muted">It may have moved, or you may not have access to it.</p>
      <ButtonLink href="/home" className="mt-6">
        Go to home
      </ButtonLink>
    </main>
  );
}
