export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// First path segments owned by routes in code. CMS pages live at /<path>/,
// so they can't take any of these.
export const RESERVED_SLUGS = new Set([
  "_fxem",
  "admin",
  "api",
  "assets",
  "auth",
  "search",
]);
