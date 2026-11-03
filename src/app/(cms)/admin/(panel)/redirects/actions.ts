"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

// Public site paths only; Arabic letters are allowed (e.g. /ar/category/…/).
function normalPath(value: FormDataEntryValue | null) {
  const p = String(value || "")
    .trim()
    .toLowerCase();
  if (
    !/^\/(?!\/)[\p{L}\p{N}/_.-]*$/u.test(p) ||
    /^\/(admin|api|auth)(\/|$)/.test(p)
  )
    throw Error("Use a public site path such as /old-page/.");
  return p.endsWith("/") ? p : p + "/";
}

async function saveRedirectWork(form: FormData) {
  await assertAdmin();
  const db = await createClient();
  const source = normalPath(form.get("source")),
    destination = normalPath(form.get("destination"));
  if (source === "/" || source === "/ar/" || source === destination)
    throw Error("Choose different paths; the homepages cannot be redirected.");
  const { data, error } = await db
    .from("redirects")
    .select("source,destination");
  if (error) throw error;
  const rules = new Map(data.map((r) => [r.source, r.destination]));
  rules.set(source, destination);
  const seen = new Set([source]);
  let current = destination;
  while (rules.has(current)) {
    if (seen.has(current)) throw Error("This redirect would create a loop.");
    seen.add(current);
    current = rules.get(current)!;
  }
  const result = await db
    .from("redirects")
    .upsert(
      { source, destination, permanent: form.get("permanent") === "on" },
      { onConflict: "source" },
    );
  if (result.error) throw result.error;
  revalidatePath("/admin/redirects/");
}

async function deleteRedirectWork(form: FormData) {
  await assertAdmin();
  const db = await createClient();
  const { error } = await db
    .from("redirects")
    .delete()
    .eq("id", String(form.get("id")));
  if (error) throw error;
  revalidatePath("/admin/redirects/");
}

async function attempt(work: () => Promise<void>) {
  try {
    return await work();
  } catch (error) {
    unstable_rethrow(error);
    return {
      error:
        error instanceof Error ? error.message : "Could not save this change.",
    };
  }
}

export async function saveRedirect(form: FormData) {
  return attempt(() => saveRedirectWork(form));
}

export async function deleteRedirect(form: FormData) {
  return attempt(() => deleteRedirectWork(form));
}
