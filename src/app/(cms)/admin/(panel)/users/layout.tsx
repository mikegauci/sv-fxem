import { Suspense } from "react";
import { AdminAccess } from "@/components/admin/access";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AdminAccess>{children}</AdminAccess>
    </Suspense>
  );
}
