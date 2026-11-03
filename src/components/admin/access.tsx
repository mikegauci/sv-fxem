import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  hasAdminCapability,
  type AdminCapability,
} from "@/lib/admin/capabilities";
export async function AdminAccess({
  capability,
  children,
}: {
  capability?: AdminCapability;
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !hasAdminCapability(user, capability))
    redirect("/admin/?denied=1");
  return children;
}
