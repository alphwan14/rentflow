"use client";

import { useActionState } from "react";
import {
  updateOrgName,
  setMemberRole,
  removeMember,
  transferOwnership,
  type TeamFormState,
} from "@/lib/team/actions";
import { createInvite, revokeInvite, type InviteFormState } from "@/lib/invites/actions";
import { ErrorText, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/auth/permissions";
import type { TeamMember } from "@/lib/supabase/types";
import { useState } from "react";

function SuccessText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{children}</p>;
}

// ---- organization name ------------------------------------------------------

export function OrgNameForm({ currentName }: { currentName: string }) {
  const [state, action] = useActionState<TeamFormState, FormData>(updateOrgName, null);
  return (
    <form action={action} className="space-y-3">
      <Field label="Organization name" hint="Shown on receipts and statements.">
        <Input name="org_name" type="text" required defaultValue={currentName} autoComplete="organization" />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <SuccessText>{state?.success}</SuccessText>
      <SubmitButton pendingText="Saving…" className="w-full sm:w-auto">
        Save name
      </SubmitButton>
    </form>
  );
}

// ---- invite creation ---------------------------------------------------------

export function InviteForm() {
  const [state, action] = useActionState<InviteFormState, FormData>(createInvite, null);
  const created = state && "inviteUrl" in state ? state : null;

  if (created) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Invite created. Share this link — it works once and expires in 7 days:
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={created.inviteUrl} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
          <CopyButton text={created.inviteUrl} />
        </div>
        {created.emailStatus === "sent" ? (
          <SuccessText>Invitation email sent.</SuccessText>
        ) : created.emailStatus === "failed" ? (
          <p className="text-sm text-amber-700">
            The email could not be sent — share the link above instead.
          </p>
        ) : null}
        <p className="text-xs text-slate-400">
          Send it over WhatsApp, SMS or email. Anyone with the link can join with the role you chose.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email (optional)" hint="Lets them join even without the link.">
          <Input name="email" type="email" inputMode="email" autoComplete="off" placeholder="staff@example.com" />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="caretaker">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ErrorText>{state && "error" in state ? state.error : null}</ErrorText>
      <SubmitButton pendingText="Creating…" className="w-full sm:w-auto">
        Create invite link
      </SubmitButton>
    </form>
  );
}

// ---- active invite row --------------------------------------------------------

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onRevoke() {
    setPending(true);
    const result = await revokeInvite(inviteId);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={onRevoke}
        disabled={pending}
        className="min-h-11 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

// ---- member row (role change + remove) ---------------------------------------

export function MemberActions({ member, selfId }: { member: TeamMember; selfId: string }) {
  const [roleState, roleAction] = useActionState<TeamFormState, FormData>(setMemberRole, null);
  const [removeState, removeAction] = useActionState<TeamFormState, FormData>(removeMember, null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (member.role === "owner") {
    return <span className="text-sm font-medium text-slate-500">{roleLabel(member.role)}</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <form action={roleAction} className="flex items-center gap-2">
        <input type="hidden" name="member_id" value={member.id} />
        <Select
          name="role"
          defaultValue={member.role === "staff" ? "caretaker" : member.role}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="w-auto min-w-28 py-1.5 text-sm"
          aria-label={`Role for ${member.full_name ?? member.email}`}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </form>

      {member.id !== selfId ? (
        confirmRemove ? (
          <form action={removeAction} className="flex items-center gap-2">
            <input type="hidden" name="member_id" value={member.id} />
            <SubmitButton pendingText="Removing…" variant="danger" className="px-3 py-1.5 text-sm">
              Confirm remove
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="min-h-11 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        )
      ) : null}

      {(roleState?.error || removeState?.error) && (
        <p className="w-full text-right text-xs text-red-600">
          {roleState?.error ?? removeState?.error}
        </p>
      )}
    </div>
  );
}

// ---- ownership transfer --------------------------------------------------------

export function TransferOwnershipForm({ members, selfId }: { members: TeamMember[]; selfId: string }) {
  const [state, action] = useActionState<TeamFormState, FormData>(transferOwnership, null);
  const [confirming, setConfirming] = useState(false);
  const candidates = members.filter((m) => m.id !== selfId);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Invite a team member first — then you can hand the organization over to them.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <Field label="New owner" hint="You will become an Admin. This cannot be undone by you.">
        <Select name="member_id" required defaultValue="">
          <option value="" disabled>
            Choose a member…
          </option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name?.trim() || m.email || m.id}
            </option>
          ))}
        </Select>
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <SuccessText>{state?.success}</SuccessText>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingText="Transferring…" variant="danger" className="w-full sm:w-auto">
            Yes, transfer ownership
          </SubmitButton>
          <button type="button" onClick={() => setConfirming(false)} className="text-sm text-slate-500 hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 sm:w-auto"
        >
          Transfer ownership…
        </button>
      )}
    </form>
  );
}
