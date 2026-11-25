"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteMessage } from "@/core/messages";
import { createInvite, removeMember, renameOrg, setMemberRole, setPlan, type FormState } from "@/server/actions/org";
import type { TeamMember } from "@/server/queries";
import type { Role } from "@/server/session";
import { Button, Field, Notice, cx, inputClass } from "@/ui";
import { CopyButton, SubmitButton } from "@/ui/client";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", caretaker: "Caretaker", viewer: "Viewer" };

export function OrgNameForm({ name }: { name: string }) {
  const [state, action] = useActionState<FormState, FormData>(renameOrg, undefined);
  return (
    <form action={action} className="space-y-3">
      <Field label="Account name" htmlFor="org-name">
        <input id="org-name" name="name" defaultValue={name} className={inputClass} />
      </Field>
      {state?.error && <Notice>{state.error}</Notice>}
      {state?.message && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton variant="secondary" size="md" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}

export function MemberRow({ member, isSelf, canEdit }: { member: TeamMember; isSelf: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={cx("flex flex-wrap items-center gap-3 px-6 py-4", pending && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">
          {member.full_name ?? member.email ?? "Team member"} {isSelf && <span className="font-normal text-muted">(you)</span>}
        </div>
        <div className="truncate text-[13px] text-muted">{member.email}</div>
        {error && <div className="text-[13px] text-unpaid">{error}</div>}
      </div>
      {canEdit ? (
        <>
          <label htmlFor={`role-${member.user_id}`} className="sr-only">
            Role
          </label>
          <select
            id={`role-${member.user_id}`}
            defaultValue={member.role}
            className="h-11 rounded-xl border border-line-strong bg-card px-3 text-[15px]"
            onChange={(e) =>
              start(async () => {
                const r = await setMemberRole(member.user_id, e.target.value as Role);
                setError(r.ok ? null : r.error);
              })
            }
          >
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="text-[15px] text-muted">{ROLE_LABEL[member.role as Role]}</span>
      )}
      {(canEdit || isSelf) &&
        (confirming ? (
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                start(async () => {
                  const r = await removeMember(member.user_id);
                  setError(r.ok ? null : r.error);
                  setConfirming(false);
                })
              }
            >
              {isSelf ? "Yes, leave" : "Yes, remove"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            {isSelf ? "Leave" : "Remove"}
          </Button>
        ))}
    </li>
  );
}

export function InviteForm({ canInviteOwners, emailOn, orgName }: { canInviteOwners: boolean; emailOn: boolean; orgName: string }) {
  const [role, setRole] = useState<Role>("manager");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ link: string; emailed: boolean; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roles: Role[] = canInviteOwners ? ["owner", "manager", "caretaker", "viewer"] : ["caretaker", "viewer"];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createInvite(role, email);
          if (!r.ok) {
            setError(r.error);
            setResult(null);
          } else {
            setError(null);
            setResult({ link: r.data!.link, emailed: r.data!.emailed, email });
            setEmail("");
          }
        });
      }}
    >
      <h3 className="text-[15px] font-semibold">Invite someone</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What can they do?" htmlFor="invite-role">
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Their email (optional)" htmlFor="invite-email" hint={emailOn ? "We'll email them the link." : "Email isn't set up yet, so share the link yourself."}>
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} disabled={!emailOn} />
        </Field>
      </div>
      {error && <Notice>{error}</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create invite"}
      </Button>
      {result && (
        <div className="fade-in space-y-3 rounded-xl bg-page p-4">
          <p className="text-[15px]">{result.emailed ? `We emailed the link to ${result.email}. You can also share it:` : "Share this link by WhatsApp or SMS. It works once and expires in 7 days."}</p>
          <code className="block truncate text-[13px]">{result.link}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.link} label="Copy link" />
            <a
              className="inline-flex h-11 items-center rounded-xl border border-line-strong bg-card px-3.5 text-[13px] font-medium hover:bg-page"
              href={`https://wa.me/?text=${encodeURIComponent(inviteMessage({ orgName, role: ROLE_LABEL[role].toLowerCase(), link: result.link }))}`}
              target="_blank"
              rel="noreferrer"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      )}
    </form>
  );
}

export function PlanSwitcher({ plan }: { plan: "free" | "growth" | "pro" }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong p-3">
      <span className="text-[13px] text-muted">RentFlow staff: change plan</span>
      {(["free", "growth", "pro"] as const).map((p) => (
        <Button key={p} size="sm" variant={p === plan ? "primary" : "secondary"} disabled={pending} onClick={() => start(async () => void (await setPlan(p)))}>
          {p === "free" ? "Free" : p === "growth" ? "Growth" : "Pro"}
        </Button>
      ))}
    </div>
  );
}
