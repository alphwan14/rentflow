"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/profile";
import { canManageTeam, canTransferOwnership } from "@/lib/auth/permissions";

export type TeamFormState = { error?: string; success?: string } | null;

export async function updateOrgName(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (!canManageTeam(profile.role)) {
    return { error: "Only owners and admins can rename the organization." };
  }

  const name = String(formData.get("org_name") ?? "").trim();
  if (!name) return { error: "Enter an organization name." };

  const supabase = await createClient();
  const { error } = await supabase.from("orgs").update({ name }).eq("id", profile.org_id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Organization name updated." };
}

export async function setMemberRole(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (!canManageTeam(profile.role)) {
    return { error: "Only owners and admins can change roles." };
  }

  const memberId = String(formData.get("member_id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!memberId || !role) return { error: "Missing member or role." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_member: memberId,
    p_role: role,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Role updated." };
}

export async function removeMember(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (!canManageTeam(profile.role)) {
    return { error: "Only owners and admins can remove members." };
  }

  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "Missing member." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_member: memberId });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Member removed." };
}

export async function transferOwnership(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const profile = await getProfile();
  if (!profile) return { error: "Not signed in." };
  if (!canTransferOwnership(profile.role)) {
    return { error: "Only the owner can transfer ownership." };
  }

  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "Choose a member." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", { p_member: memberId });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Ownership transferred." };
}
