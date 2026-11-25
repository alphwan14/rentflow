import type { Metadata } from "next";
import { getSession } from "@/server/session";
import { ButtonLink, Card } from "@/ui";
import { Brand } from "@/ui/brand";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const s = await getSession();
  const next = encodeURIComponent(`/join/${token}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Brand href="/" />
      <div className="flex flex-1 flex-col justify-center">
        <Card className="p-6 sm:p-8">
          <h1 className="text-[22px] font-semibold tracking-tight">You&apos;ve been invited to RentFlow</h1>
          <p className="mt-1 text-[14px] text-muted">Join to see the buildings and payments you&apos;ve been given access to.</p>
          <div className="mt-6">
            {s ? (
              <JoinButton token={token} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/signup?next=${next}`}>Create account</ButtonLink>
                <ButtonLink href={`/login?next=${next}`} variant="secondary">
                  Sign in
                </ButtonLink>
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
