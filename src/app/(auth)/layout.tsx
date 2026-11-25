import { Wordmark } from "@/ui/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-4">
      <Wordmark href="/" />
      <div className="fade-in flex flex-1 flex-col justify-center py-8">{children}</div>
    </main>
  );
}
