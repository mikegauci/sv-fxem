import RedirectManager from "@/components/admin/redirect-manager";

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;
export const metadata = { title: "Redirects" };
export default RedirectManager;
