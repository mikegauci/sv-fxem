import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminSidebar } from "@/components/admin/sidebar";
import { signOut } from "@/lib/auth/actions";
import { getCurrentUser, requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s - FXEM Admin" },
  robots: { index: false, follow: false },
};

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="text-body flex min-h-full flex-1 bg-[#f5f5f5]">
      <aside className="bg-ink sticky top-0 hidden h-dvh w-60 shrink-0 flex-col p-4 text-white md:flex">
        <Link href="/admin/" className="mb-8 flex items-center gap-2 px-3">
          <Image
            src="/assets/e486f0721487-fxem-final-logo-1024x351.png"
            alt="FXEM"
            width={1024}
            height={351}
            className="h-auto w-24 brightness-0 invert"
          />
          <span className="text-xs text-white/60">Admin</span>
        </Link>
        <Suspense fallback={null}>
          <AdminNavigation />
        </Suspense>
        <div className="mt-auto space-y-2 px-3 text-sm">
          <Link href="/" className="text-footer hover:text-brand block">
            View site
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-footer hover:text-brand">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="bg-ink flex items-center justify-between px-4 py-3 md:hidden">
          <Link href="/admin/" className="text-sm font-bold text-white">
            FXEM Admin
          </Link>
          <details className="relative">
            <summary className="text-footer cursor-pointer text-sm">
              Menu
            </summary>
            <div className="bg-ink absolute right-0 z-20 mt-2 w-60 rounded p-4 shadow-lg">
              <Suspense fallback={null}>
                <AdminNavigation />
              </Suspense>
            </div>
          </details>
        </div>
        <main className="mx-auto max-w-6xl p-6 md:p-10">
          <Suspense fallback={<p>Loading…</p>}>
            <AdminOnly>{children}</AdminOnly>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

async function AdminOnly({ children }: { children: React.ReactNode }) {
  // The auth client reads the clock, so mark this as request-time first.
  await connection();
  await requireRole(["admin"], "/admin/");
  return children;
}

async function AdminNavigation() {
  // The auth client reads the clock, so mark this as request-time first.
  await connection();
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  return <AdminSidebar capabilities={user.adminCapabilities} />;
}
