import type { Metadata } from "next";
import { AdminUserList } from "@/components/admin/user-list";
import { requireAdminPage } from "@/lib/auth/admin";
import { userListParams, type UserList } from "@/lib/admin/users";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users" };
export default async function UsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const me = await requireAdminPage();
  const params = await searchParams;
  const { q, role, page } = userListParams(params);
  const db = await createClient();
  const { data, error } = await db.rpc("admin_list_users", {
    search_text: q,
    filter_role: role,
    page_number: page,
  });
  if (error || !data)
    return (
      <p role="alert" className="text-red-700">
        Could not load users. Please refresh and try again.
      </p>
    );
  return (
    <AdminUserList
      result={data as unknown as UserList}
      q={q}
      role={role}
      me={me.id}
      deleted={params.deleted === "1"}
    />
  );
}
