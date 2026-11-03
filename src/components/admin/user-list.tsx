import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import {
  ADMIN_CAPABILITIES,
  type AdminCapability,
} from "@/lib/admin/capabilities";
import {
  USER_PAGE_SIZE,
  USER_ROLES,
  usersHref,
  type UserList,
} from "@/lib/admin/users";

export function AdminUserList({
  result,
  q,
  role,
  me,
  deleted = false,
}: {
  result: UserList;
  q: string;
  role: string;
  me: string;
  deleted?: boolean;
}) {
  const { users, total, page, pages } = result;
  const start = total ? (page - 1) * USER_PAGE_SIZE + 1 : 0;
  const end = Math.min(page * USER_PAGE_SIZE, total);
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, index) => Math.max(1, Math.min(page - 2, pages - 4)) + index,
  );
  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Manage accounts, roles and admin permissions."
        actions={
          <Link
            href="/admin/users/new/"
            className="bg-brand hover:bg-ink hover:text-brand rounded-lg px-5 py-2.5 font-bold text-black"
          >
            Add user
          </Link>
        }
      />
      {deleted && (
        <p
          role="status"
          className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800"
        >
          User deleted. Their content was retained.
        </p>
      )}
      <form
        key={`${q}:${role}`}
        action="/admin/users/"
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4"
      >
        <label className="min-w-0 flex-1 text-sm font-semibold">
          Search users
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, email or username"
            maxLength={200}
            className="mt-2 w-full min-w-[180px] rounded-lg border border-black/20 px-3 py-2.5 text-base"
          />
        </label>
        <label className="text-sm font-semibold">
          Role
          <select
            name="role"
            defaultValue={role}
            className="mt-2 block rounded-lg border border-black/20 bg-white px-3 py-2.5 text-base"
          >
            <option value="">All roles</option>
            {Object.entries(USER_ROLES).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="bg-ink rounded-lg px-5 py-2.5 font-bold text-white"
          type="submit"
        >
          Search
        </button>
        {(q || role) && (
          <Link href="/admin/users/" className="px-3 py-2.5 text-sm underline">
            Clear filters
          </Link>
        )}
      </form>
      <div className="text-muted mb-3 flex flex-wrap justify-between gap-2 text-sm">
        <p role="status">
          Showing {start}–{end} of {total} {total === 1 ? "user" : "users"}
        </p>
        <p>50 users per page</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="text-muted border-b border-black/10 bg-black/3 text-xs uppercase">
            <tr>
              {["Name", "Email", "Role & access", "Joined", "Actions"].map(
                (label) => (
                  <th key={label} className="px-4 py-3 font-semibold">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-black/5 last:border-0"
              >
                <td className="px-4 py-4">
                  <Link
                    className="text-ink font-semibold hover:underline"
                    href={`/admin/users/${user.id}/`}
                  >
                    {user.full_name || user.username || "Unnamed user"}
                  </Link>
                  {user.id === me && (
                    <span className="bg-brand/20 ml-2 rounded px-1.5 py-0.5 text-xs">
                      You
                    </span>
                  )}
                  {user.username && (
                    <p className="text-muted mt-1 text-xs">@{user.username}</p>
                  )}
                </td>
                <td className="px-4 py-4">{user.email}</td>
                <td className="max-w-xs px-4 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.role === "admin" ? "bg-brand/20 text-ink" : "bg-black/5"}`}
                  >
                    {USER_ROLES[user.role]}
                  </span>
                  {user.role === "admin" && (
                    <p className="text-muted mt-2 text-xs">
                      {user.admin_capabilities === null
                        ? "Full administrator"
                        : user.admin_capabilities.length
                          ? user.admin_capabilities
                              .map(
                                (cap) =>
                                  ADMIN_CAPABILITIES[cap as AdminCapability],
                              )
                              .join(", ")
                          : "No CMS sections assigned"}
                    </p>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {new Intl.DateTimeFormat("en-MT", {
                    dateStyle: "medium",
                    timeZone: "Europe/Malta",
                  }).format(new Date(user.created_at))}
                </td>
                <td className="px-4 py-4">
                  <Link
                    href={`/admin/users/${user.id}/`}
                    className="font-semibold underline"
                  >
                    Edit{user.id !== me ? " / delete" : ""}
                  </Link>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={5} className="text-muted px-4 py-12 text-center">
                  {q || role
                    ? "No users match these filters. Try another name, email or role."
                    : "No users yet. Add the first account above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav
          aria-label="User pagination"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p>
            Page {page} of {pages}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {page > 1 && (
              <Link
                href={usersHref(q, role, page - 1)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2"
              >
                ← Previous
              </Link>
            )}
            {numbers.map((n) => (
              <Link
                key={n}
                aria-current={n === page ? "page" : undefined}
                href={usersHref(q, role, n)}
                className={`rounded-lg border px-3 py-2 ${n === page ? "border-brand bg-brand font-bold" : "border-black/15 bg-white"}`}
              >
                {n}
              </Link>
            ))}
            {page < pages && (
              <Link
                href={usersHref(q, role, page + 1)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2"
              >
                Next →
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
