import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Cookie-less client for public content. It reads as an anonymous visitor
// (published rows only), so it is safe inside "use cache" functions.
export const publicDb = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
