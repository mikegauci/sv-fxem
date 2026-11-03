import "server-only";
import { redirect } from "next/navigation";
import {
  hasAdminCapability,
  type AdminCapability,
} from "@/lib/admin/capabilities";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

// For Server Actions: re-check the session instead of trusting the page gate.
export async function assertAdmin(
  capability?: AdminCapability,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !hasAdminCapability(user, capability))
    throw new Error("Not authorised");
  return user;
}

export async function requireAdminPage(
  capability?: AdminCapability,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !hasAdminCapability(user, capability))
    redirect("/admin/?denied=1");
  return user;
}
