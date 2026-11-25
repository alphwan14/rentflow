"use client";

import { useActionState, useState, useTransition } from "react";
import { createInvite, removeMember, renameOrg, setMemberRole, setPlan, type FormState } from "@/server/actions/org";
import type { TeamMember } from "@/server/queries";
import type { Role } from "@/server/session";
import { Alert, Button, inputClass, cx } from "@/ui";
import { CopyButton, SubmitButton } from "@/ui/client";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", caretaker: "Caretaker", viewer: "Viewer" };

export function OrgNameForm({ name }: { name: string }) {
  const [state, action] = useActionState<FormState, FormData>(renameOrg, undefined);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <input name="name" defaultValue={name} className={inputClass} aria-label="Account name" />
      <SubmitButton variant="secondary">Save</SubmitButton>
      {state?.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function MemberRow({ member, isSelf, canEdit }: { member: TeamMember; isSelf: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <li className={cx("flex flex-wrap items-center gap-3 px-5 py-3", pending && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">
          {member.full_name ?? member.email ?? "Member"} {isSelf && <span className="font-normal text-muted">(you)</span>}
        </div>
        <div className="truncate text-[12px] text-muted">{member.email}</div>
        {error && <div className="text-[12px] text-unpaid">{error}</div>}
      </div>
      {canEdit ? (
        <select
          aria-label="Role"
          defaultValue={member.role}
          className="h-9 rounded-full border border-line-strong bg-card px-3 text-[13px]"
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
      ) : (
        <span className="text-[13px] text-ink-2">{ROLE_LABEL[member.role as Role]}</span>
      )}
      {(canEdit || isSelf) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!window.confirm(isSelf ? "Leave this account?" : "Remove this person?")) return;
            start(async () => {
              const r = await removeMember(member.user_id);
              setError(r.ok ? null : r.error);
            });
          }}
        >
          {isSelf ? "Leave" : "Remove"}
        </Button>
      )}
    </li>
  );
}

export function InviteForm({ canInviteOwners }: { canInviteOwners: boolean }) {
  const [role, setRole] = useState<Role>("manager");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roles: Role[] = canInviteOwners ? ["owner", "manager", "caretaker", "viewer"] : ["caretaker", "viewer"];
  return (
    <div className="space-y-3">
      <div className="text-[14px] font-medium">Invite someone</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={cx(inputClass, "sm:w-48")} aria-label="Role">
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createInvite(role);
              if (!r.ok) {
                setError(r.error);
                setLink(null);
              } else {
                setError(null);
                setLink(`${window.location.origin}/join/${r.data!.token}`);
              }
            })
          }
        >
          {pending ? "Creating…" : "Create invite link"}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {link && (
        <div className="flex flex-col gap-2 rounded-xl bg-page p-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate text-[13px]">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
      )}
      <p className="text-[12px] text-muted">Send the link by WhatsApp or SMS. It works once and expires in 7 days.</p>
    </div>
  );
}

export function PlanSwitcher({ plan }: { plan: "free" | "growth" | "pro" }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong p-3">
      <span className="text-[13px] text-muted">RentFlow staff: set plan</span>
      {(["free", "growth", "pro"] as const).map((p) => (
        <Button key={p} size="sm" variant={p === plan ? "primary" : "secondary"} disabled={pending} onClick={() => start(async () => void (await setPlan(p)))}>
          {p}
        </Button>
      ))}
    </div>
  );
}
