import { ButtonLink } from "@/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-[22px] font-semibold">Not found</h1>
      <p className="mt-1 text-[14px] text-muted">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <ButtonLink href="/home" className="mt-6">
        Go home
      </ButtonLink>
    </main>
  );
}
