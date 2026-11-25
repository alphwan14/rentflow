import type { Metadata } from "next";
import { getSession } from "@/server/session";
import { ButtonLink, Card } from "@/ui";
import { Wordmark } from "@/ui/brand";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const s = await getSession();
  const next = encodeURIComponent(`/join/${token}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-4">
      <Wordmark href="/" />
      <div className="fade-in flex flex-1 flex-col justify-center py-8">
        <Card className="p-6 sm:p-8">
          <h1 className="text-[20px] font-semibold">You&apos;ve been invited</h1>
          <p className="mt-1 text-[15px] text-muted">Join to see the buildings and rent you&apos;ve been asked to help with.</p>
          <div className="mt-6">
            {s ? (
              <JoinButton token={token} />
            ) : (
              <div className="flex flex-col gap-2">
                <ButtonLink href={`/signup?next=${next}`} size="lg">
                  Create an account
                </ButtonLink>
                <ButtonLink href={`/login?next=${next}`} variant="secondary" size="lg">
                  I have an account
                </ButtonLink>
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
