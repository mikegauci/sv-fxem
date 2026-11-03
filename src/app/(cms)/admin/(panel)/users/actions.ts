"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateUser,
  type UserInput,
  type UserResult,
} from "@/lib/admin/users";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function refreshUsers() {
  revalidatePath("/admin/users/");
  revalidatePath("/admin/", "layout");
}

export async function saveUser(
  id: string | null,
  input: UserInput,
): Promise<UserResult> {
  const actor = await assertAdmin();
  if (id && !UUID.test(id)) return { error: "Invalid user." };
  const clean = validateUser(input, !id);
  if ("error" in clean) return clean;
  const { value, capabilities } = clean;
  const auth = createAdminClient();
  if (!auth)
    return { error: "User management is not configured on this server." };
  const db = await createClient();
  const { data: sameUsername, error: usernameError } = value.username
    ? await db
        .from("profiles")
        .select("id")
        .ilike("username", value.username.replace(/[\\%_]/g, "\\$&"))
        .maybeSingle()
    : { data: null, error: null };
  if (usernameError)
    return { error: "Could not check this username. Try again." };
  if (sameUsername && sameUsername.id !== id)
    return { error: "That username is already taken." };
  const { data: sameEmail, error: emailError } = await db
    .from("profiles")
    .select("id")
    .ilike("email", value.email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (emailError) return { error: "Could not check this email. Try again." };
  if (sameEmail && sameEmail.id !== id)
    return { error: "An account already uses this email address." };
  let target = id;
  if (!target) {
    const { data, error } = await auth.auth.admin.createUser({
      email: value.email,
      password: value.password,
      email_confirm: true,
      user_metadata: { full_name: value.fullName },
    });
    if (error || !data.user)
      return { error: error?.message ?? "Could not create this account." };
    target = data.user.id;
  }
  const { error: profileError } = await db.rpc("admin_save_user_profile", {
    target_user: target,
    display_name: value.fullName,
    new_username: value.username,
    new_role: value.role,
    capabilities,
  });
  if (profileError) {
    if (!id) {
      const cleanup = await auth.auth.admin.deleteUser(target);
      if (cleanup.error)
        return {
          error: `The account was created, but its profile could not be saved. Find ${value.email} in the user list to complete setup.`,
        };
    }
    return { error: profileError.message };
  }
  let warning: string | undefined;
  if (id) {
    const { data: existing, error: lookupError } =
      await auth.auth.admin.getUserById(id);
    if (lookupError || !existing.user)
      warning =
        "Profile and permissions saved. Login details could not be checked; try again.";
    else {
      const emailChanged = existing.user.email?.toLowerCase() !== value.email;
      if (emailChanged || value.password) {
        if (id === actor.id)
          warning =
            "Profile saved. Ask another full administrator to change your login details.";
        else {
          const { error } = await auth.auth.admin.updateUserById(id, {
            ...(emailChanged
              ? { email: value.email, email_confirm: true }
              : {}),
            ...(value.password ? { password: value.password } : {}),
          });
          if (error)
            warning = `Profile and permissions saved, but login details were not updated: ${error.message}`;
        }
      }
    }
  }
  refreshUsers();
  return {
    id: target,
    message: id ? "User updated." : "User created. No email was sent.",
    ...(warning ? { warning } : {}),
  };
}

export async function deleteUser(
  id: string,
  confirmedEmail: string,
): Promise<{ error: string } | { deleted: true }> {
  const actor = await assertAdmin();
  if (!UUID.test(id)) return { error: "Invalid user." };
  if (id === actor.id) return { error: "You cannot delete your own account." };
  const db = await createClient();
  const { data: user, error } = await db
    .from("profiles")
    .select("email,role,admin_capabilities")
    .eq("id", id)
    .maybeSingle();
  if (error || !user)
    return { error: "This user could not be found. Refresh and try again." };
  if (confirmedEmail.trim().toLowerCase() !== user.email.toLowerCase())
    return { error: "Type the user's email to confirm deletion." };
  const auth = createAdminClient();
  if (!auth)
    return { error: "User management is not configured on this server." };
  const { error: releaseError } = await db.rpc("admin_release_user_files", {
    target_user: id,
  });
  if (releaseError) return { error: releaseError.message };
  const removed = await auth.auth.admin.deleteUser(id);
  if (removed.error)
    return {
      error:
        "Could not delete this account. A full administrator must remain, and connected records may prevent deletion.",
    };
  refreshUsers();
  return { deleted: true };
}
