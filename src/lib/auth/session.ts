import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

export type AppRole = Enums<"app_role">;

export type CurrentUser = {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  role: AppRole;
  adminCapabilities: string[] | null;
};

// Reads the session from the request cookies. Call it inside a <Suspense>
// boundary (cacheComponents treats cookie reads as request-time data).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, username, full_name, role, admin_capabilities")
    .eq("id", userId)
    .single();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role,
    adminCapabilities: profile.admin_capabilities,
  };
});

export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/admin/login/?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireRole(
  roles: AppRole[],
  next: string,
): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
