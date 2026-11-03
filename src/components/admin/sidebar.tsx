"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string; ready: boolean };

// Sections are enabled as each PR lands.
const sections: { title: string; items: Item[] }[] = [
  {
    title: "Content",
    items: [
      { label: "Dashboard", href: "/admin/", ready: true },
      { label: "Pages", href: "/admin/pages/", ready: true },
      { label: "News", href: "/admin/news/", ready: false },
      { label: "Menus", href: "/admin/menus/", ready: false },
      { label: "Footer", href: "/admin/footer/", ready: false },
    ],
  },
  {
    title: "Site",
    items: [
      { label: "Media", href: "/admin/media/", ready: true },
      { label: "Users", href: "/admin/users/", ready: true },
      { label: "Redirects", href: "/admin/redirects/", ready: true },
    ],
  },
];

export function AdminSidebar({
  capabilities = null,
}: {
  capabilities?: string[] | null;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="space-y-6 text-sm">
      {sections
        .filter((section) =>
          section.items.some(
            (item) =>
              capabilities === null ||
              item.href === "/admin/" ||
              capabilities.includes(item.href.split("/")[2]),
          ),
        )
        .map((section) => (
          <div key={section.title}>
            <p className="text-footer-muted mb-2 px-3 text-xs font-semibold tracking-wider uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items
                .filter(
                  (item) =>
                    capabilities === null ||
                    item.href === "/admin/" ||
                    capabilities.includes(item.href.split("/")[2]),
                )
                .map((item) => {
                  const active =
                    item.href === "/admin/"
                      ? pathname === "/admin/"
                      : pathname.startsWith(item.href);
                  if (!item.ready)
                    return (
                      <li
                        key={item.href}
                        className="flex justify-between px-3 py-1.5 text-white/35"
                      >
                        {item.label}
                        <span className="text-[10px] tracking-wide uppercase">
                          Soon
                        </span>
                      </li>
                    );
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded px-3 py-1.5 transition-colors ${
                          active
                            ? "text-brand bg-white/10 font-semibold"
                            : "text-footer hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
    </nav>
  );
}
