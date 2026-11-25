import { Brand } from "@/ui/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Brand href="/" />
      <div className="flex flex-1 flex-col justify-center py-10">{children}</div>
    </main>
  );
}
