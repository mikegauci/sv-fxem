import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { UserEditor } from "@/components/admin/user-editor";
import { requireAdminPage } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { saveUser, deleteUser } from "../actions";
export const metadata = { title: "Edit user" };
export default async function EditUserPage({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]">) {
  const me = await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const { data: user, error } = await db
    .from("profiles")
    .select("id,email,full_name,username,role,admin_capabilities,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!user) notFound();
  const query = await searchParams;
  return (
    <>
      <AdminPageHeader
        title={user.full_name || user.email}
        description="Edit account details and control CMS access."
      />
      {query.created === "1" && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-green-50 p-3 text-green-800"
        >
          Account created. No email was sent.
        </p>
      )}
      <UserEditor
        key={user.id}
        user={user}
        me={me.id}
        actions={{ onSave: saveUser, onDelete: deleteUser }}
      />
    </>
  );
}
