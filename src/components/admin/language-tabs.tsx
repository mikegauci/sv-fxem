import Link from "next/link";

export const LANGUAGES = { en: "English", ar: "العربية" } as const;
export type Language = keyof typeof LANGUAGES;

// EN/AR switch for admin lists and editors. `hrefs` gives each language's
// link; a missing link shows the language as not available.
export function LanguageTabs({
  active,
  hrefs,
  missing,
}: {
  active: Language;
  hrefs: Partial<Record<Language, string>>;
  missing?: React.ReactNode;
}) {
  return (
    <div
      role="tablist"
      aria-label="Language"
      className="inline-flex items-center gap-1 rounded-lg bg-white p-1 text-sm"
    >
      {(Object.keys(LANGUAGES) as Language[]).map((language) =>
        hrefs[language] ? (
          <Link
            key={language}
            role="tab"
            aria-selected={language === active}
            href={hrefs[language]!}
            lang={language}
            className={`rounded-md px-3 py-1.5 ${
              language === active
                ? "bg-ink font-semibold text-white"
                : "text-muted hover:text-ink"
            }`}
          >
            {LANGUAGES[language]}
          </Link>
        ) : (
          <span
            key={language}
            lang={language}
            className="text-muted px-3 py-1.5 opacity-60"
          >
            {LANGUAGES[language]}
          </span>
        ),
      )}
      {missing}
    </div>
  );
}
