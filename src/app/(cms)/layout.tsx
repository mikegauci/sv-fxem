import type { Metadata } from "next";
import { env } from "@/lib/env";
import "./globals.css";

// Root layout for the CMS (admin and sign-in). Public pages are rendered by
// the route handlers in src/app/[[...path]] with the original theme markup.
export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: "FXEM Admin", template: "%s - FXEM Admin" },
  robots: { index: false, follow: false },
};

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
