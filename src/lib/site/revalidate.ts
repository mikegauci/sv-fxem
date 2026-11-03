import "server-only";
import { updateTag } from "next/cache";

// Call from admin Server Actions after saving content, so visitors see the
// change on their next request. Without arguments everything is refreshed.
export function revalidateContent(
  scope?: { page: string } | { chrome: "en" | "ar" } | { routes: true },
) {
  if (!scope) return updateTag("cms");
  if ("page" in scope) {
    updateTag(`cms:page:${scope.page}`);
    updateTag("cms:search");
  }
  if ("chrome" in scope) updateTag(`cms:chrome:${scope.chrome}`);
  if ("routes" in scope) updateTag("cms:routes");
}
