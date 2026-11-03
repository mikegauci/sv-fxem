"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exactUsernamePattern,
  resolveLoginEmail,
} from "@/lib/auth/login-identifier";

export type FormState =
  | {
      error?: string;
      message?: string;
      // Echoed back so inputs keep their values (React resets forms after an action).
      fields?: Record<string, string>;
    }
  | undefined;

async function origin() {
  return (await headers()).get("origin") ?? env.siteUrl;
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function signIn(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const identifier = field(formData, "identifier") || field(formData, "email");
  const password = String(formData.get("password") ?? "");
  const fields = { identifier };
  if (!identifier || !password)
    return { error: "Enter your username or email and password.", fields };

  const fail = () => ({
    error: "Incorrect username/email or password.",
    fields,
  });
  let home = "/admin/";
  try {
    const email = await resolveLoginEmail(identifier, async (username) => {
      const admin = createAdminClient();
      if (!admin) return null;
      const { data, error } = await admin
        .from("profiles")
        .select("email")
        .ilike("username", exactUsernamePattern(username))
        .maybeSingle();
      if (error) return null;
      return data?.email ?? null;
    });
    if (!email) return fail();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return fail();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      return { error: "This account has no CMS access.", fields };
    }
    home = "/admin/";
  } catch {
    return fail();
  }

  redirect(safeNext(formData.get("next"), home));
}

export async function requestPasswordReset(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email");
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/admin/reset-password/`,
  });
  return {
    message:
      "If that email has an account, you will receive a link to create a new password.",
  };
}

export async function updatePassword(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== String(formData.get("password_confirm") ?? ""))
    return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return { error: "Your reset link has expired. Request a new one." };

  redirect("/admin/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login/");
}
