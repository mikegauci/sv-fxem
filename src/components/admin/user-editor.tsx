"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capabilities";
import {
  USER_ROLES,
  type ManagedUser,
  type UserInput,
  type UserResult,
} from "@/lib/admin/users";

type Actions = {
  onSave: (id: string | null, input: UserInput) => Promise<UserResult>;
  onDelete: (
    id: string,
    email: string,
  ) => Promise<{ error: string } | { deleted: true }>;
};
const field =
  "mt-2 w-full rounded-lg border border-black/20 bg-white px-3 py-2.5 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

export function UserEditor({
  user,
  me,
  actions,
}: {
  user: ManagedUser | null;
  me: string;
  actions: Actions;
}) {
  const router = useRouter();
  const [value, setValue] = useState<UserInput>({
    email: user?.email ?? "",
    fullName: user?.full_name ?? "",
    username: user?.username ?? "",
    role: user?.role ?? "admin",
    fullAccess: user?.admin_capabilities === null,
    capabilities: user?.admin_capabilities ?? [],
    password: "",
  });
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const self = user?.id === me;
  const update = (patch: Partial<UserInput>) => {
    setValue((v) => ({ ...v, ...patch }));
    setError("");
    setMessage("");
    setWarning("");
  };
  function save(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      setError("");
      setMessage("");
      setWarning("");
      try {
        const result = await actions.onSave(user?.id ?? null, value);
        if ("error" in result) return setError(result.error);
        setMessage(result.message);
        setWarning(result.warning ?? "");
        setValue((v) => ({ ...v, password: "" }));
        if (!user) router.replace(`/admin/users/${result.id}/?created=1`);
        router.refresh();
      } catch {
        setError(
          "Could not save this user. Your entries are still here; please try again.",
        );
      }
    });
  }
  function remove() {
    if (!user) return;
    start(async () => {
      setError("");
      try {
        const result = await actions.onDelete(user.id, confirmation);
        if ("error" in result) return setError(result.error);
        dialog.current?.close();
        router.replace("/admin/users/?deleted=1");
        router.refresh();
      } catch {
        setError("Could not delete this user. Try again.");
      }
    });
  }
  return (
    <div className="space-y-6">
      <form
        onSubmit={save}
        className="space-y-6 rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-7"
      >
        <fieldset
          disabled={pending}
          className="grid min-w-0 gap-5 sm:grid-cols-2"
        >
          <legend className="mb-5 text-lg font-bold">Account details</legend>
          <label className="text-sm font-semibold">
            Full name
            <input
              maxLength={150}
              autoComplete="off"
              value={value.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
              className={field}
            />
          </label>
          <label className="text-sm font-semibold">
            Username
            <input
              maxLength={32}
              autoComplete="off"
              value={value.username}
              onChange={(e) => update({ username: e.target.value })}
              className={field}
            />
            <span className="text-muted mt-1 block text-xs font-normal">
              Optional. 3–32 letters, numbers, dots, underscores or hyphens.
            </span>
          </label>
          <label className="text-sm font-semibold">
            Email *
            <input
              type="email"
              required
              readOnly={self}
              maxLength={254}
              autoComplete="off"
              value={value.email}
              onChange={(e) => update({ email: e.target.value })}
              className={`${field} read-only:bg-black/5`}
            />
          </label>
          {!self && (
            <label className="text-sm font-semibold">
              {user ? "New password" : "Initial password *"}
              <input
                type="password"
                autoComplete="new-password"
                required={!user}
                minLength={12}
                maxLength={128}
                value={value.password}
                onChange={(e) => update({ password: e.target.value })}
                className={field}
              />
              <span className="text-muted mt-1 block text-xs font-normal">
                {user ? "Leave blank to keep the current password. " : ""}At
                least 12 characters. No email is sent automatically.
              </span>
            </label>
          )}
        </fieldset>
        <fieldset
          disabled={pending || self}
          className="min-w-0 space-y-4 border-t border-black/10 pt-5 disabled:opacity-65"
        >
          <legend className="pt-5 text-lg font-bold">Role & permissions</legend>
          <label className="block max-w-sm text-sm font-semibold">
            Role
            <select
              value={value.role}
              onChange={(e) =>
                update({ role: e.target.value as UserInput["role"] })
              }
              className={field}
            >
              {Object.entries(USER_ROLES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {value.role === "admin" ? (
            <div className="space-y-4">
              <label className="flex items-start gap-3 rounded-lg border border-black/10 p-4">
                <input
                  type="checkbox"
                  checked={value.fullAccess}
                  onChange={(e) => update({ fullAccess: e.target.checked })}
                  className="accent-brand mt-1 size-4"
                />
                <span>
                  <span className="block font-bold">Full administrator</span>
                  <span className="text-muted block text-sm">
                    All CMS sections, user management, permissions, settings and
                    maintenance tools.
                  </span>
                </span>
              </label>
              {!value.fullAccess && (
                <fieldset className="rounded-lg border border-black/10 p-4">
                  <legend className="px-2 text-sm font-bold">
                    Allowed CMS sections
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(ADMIN_CAPABILITIES).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-3 rounded p-2 hover:bg-black/5"
                      >
                        <input
                          type="checkbox"
                          checked={value.capabilities.includes(key)}
                          onChange={(e) =>
                            update({
                              capabilities: e.target.checked
                                ? [...value.capabilities, key]
                                : value.capabilities.filter(
                                    (cap) => cap !== key,
                                  ),
                            })
                          }
                          className="accent-brand size-4"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-muted mt-3 text-xs">
                    Grant Media library access for uploads. User management,
                    site settings and maintenance tools are reserved for full
                    administrators. With no sections selected, this admin only
                    sees the dashboard.
                  </p>
                </fieldset>
              )}
            </div>
          ) : (
            <p className="text-muted text-sm">
              They can sign in but have no CMS access.
            </p>
          )}
        </fieldset>
        {self && (
          <p className="bg-brand/15 rounded-lg p-3 text-sm">
            This is your account. Your login details, role and permissions are
            protected here; another full administrator can change them.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-black/10 pt-5">
          <button
            type="submit"
            disabled={pending}
            className="bg-brand hover:bg-ink hover:text-brand rounded-lg px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            {pending ? "Saving…" : user ? "Save user" : "Create user"}
          </button>
          <Link
            href="/admin/users/"
            className="px-3 py-2 text-sm hover:underline"
          >
            Back to users
          </Link>
          {message && (
            <p role="status" className="text-sm text-green-700">
              {message}
            </p>
          )}
        </div>
        {warning && (
          <p
            role="status"
            className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            {warning}
          </p>
        )}
        {error && !deleting && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
      {user && !self && (
        <section className="rounded-xl border border-red-200 bg-white p-6">
          <h2 className="text-lg font-bold">Delete account</h2>
          <p className="text-muted mt-2 text-sm">
            Permanently remove this user’s login. Content and public listings
            are retained; their listings become unassigned.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError("");
              setConfirmation("");
              setDeleting(true);
              dialog.current?.showModal();
            }}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            Delete user
          </button>
          <dialog
            ref={dialog}
            onClose={() => setDeleting(false)}
            aria-labelledby={title}
            onCancel={(e) => {
              if (pending) e.preventDefault();
            }}
            className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border-0 bg-white p-6 shadow-xl backdrop:bg-black/60"
          >
            <h2 id={title} className="text-xl font-bold">
              Delete this user?
            </h2>
            <p className="mt-3 text-sm leading-6">
              This permanently removes {user.email}’s account. It cannot be
              undone. Their content will stay on the site.
            </p>
            <label className="mt-4 block text-sm font-semibold">
              Type {user.email} to confirm
              <input
                type="email"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={field}
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                disabled={pending}
                onClick={() => dialog.current?.close()}
                className="rounded-lg border border-black/20 px-4 py-2.5 font-bold"
              >
                Keep user
              </button>
              <button
                type="button"
                disabled={
                  pending ||
                  confirmation.trim().toLowerCase() !== user.email.toLowerCase()
                }
                onClick={remove}
                className="rounded-lg bg-red-700 px-4 py-2.5 font-bold text-white disabled:opacity-40"
              >
                {pending ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </dialog>
        </section>
      )}
    </div>
  );
}
