import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";
import {
  saveRedirect,
  deleteRedirect,
} from "@/app/(cms)/admin/(panel)/redirects/actions";
const input = "rounded border border-black/20 bg-white p-2 text-sm";
export default async function RedirectManager() {
  const db = await createClient();
  const { data, error } = await db
    .from("redirects")
    .select("*")
    .order("source");
  if (error) throw error;
  return (
    <>
      <AdminPageHeader
        title="Redirect manager"
        description="Changes can take up to a minute to reach visitors. Use internal paths; loops are rejected."
      />
      <ActionForm action={saveRedirect} className="mb-6 flex flex-wrap gap-3">
        <input
          required
          name="source"
          aria-label="Old path"
          placeholder="/old-page/"
          className={input}
        />
        <input
          required
          name="destination"
          aria-label="New path"
          placeholder="/new-page/"
          className={input}
        />
        <label className="p-2">
          <input type="checkbox" name="permanent" defaultChecked /> Permanent
        </label>
        <button className="cms-button">Save redirect</button>
      </ActionForm>
      <ul className="divide-y rounded bg-white p-5">
        {data.map((r) => (
          <li className="flex flex-wrap items-center gap-4 py-3" key={r.id}>
            <code className="break-all">
              {r.source} → {r.destination}
            </code>
            <span>{r.permanent ? "Permanent" : "Temporary"}</span>
            <ActionForm action={deleteRedirect}>
              <input type="hidden" name="id" value={r.id} />
              <button className="text-coral underline">Remove rule</button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </>
  );
}
