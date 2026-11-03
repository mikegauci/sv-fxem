// Page URL rules for the editor. Paths have no slashes at the ends; Arabic
// pages live under ar/. Segments may use Arabic letters.
const reserved = new Set([
  "_fxem",
  "_next",
  "admin",
  "api",
  "assets",
  "auth",
  "search",
  "sitemap.xml",
  "robots.txt",
  "wp-admin",
  "wp-content",
  "index.php",
]);

export function cleanPagePath(input, language) {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-");
  const segments = raw ? raw.split("/") : [];
  if (language === "ar" && segments[0] !== "ar") segments.unshift("ar");
  if (language === "en" && segments[0] === "ar")
    return { error: "English pages cannot live under /ar/." };
  const path = segments.join("/");
  if (!segments.every((s) => /^[\p{L}\p{N}_-]+$/u.test(s)))
    return { error: "Use letters, numbers and hyphens in the page URL." };
  const first = language === "ar" ? segments[1] : segments[0];
  if (first !== undefined && reserved.has(first))
    return { error: `/${first}/ is used by the site. Choose another URL.` };
  if (path.length > 200) return { error: "The page URL is too long." };
  return { path };
}
