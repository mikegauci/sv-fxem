import { AdminPageHeader } from "@/components/admin/page-header";
import { UserEditor } from "@/components/admin/user-editor";
import { requireAdminPage } from "@/lib/auth/admin";
import { saveUser, deleteUser } from "../actions";
export const metadata = { title: "Add user" };
export default async function NewUserPage() {
  const me = await requireAdminPage();
  return (
    <>
      <AdminPageHeader
        title="Add user"
        description="Create an account and choose its role and permissions."
      />
      <UserEditor
        user={null}
        me={me.id}
        actions={{ onSave: saveUser, onDelete: deleteUser }}
      />
    </>
  );
}
