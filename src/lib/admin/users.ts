import {
  ADMIN_CAPABILITIES,
  cleanAdminCapabilities,
  type AdminCapability,
} from "./capabilities.ts";

export const USER_PAGE_SIZE = 50;
export const USER_ROLES = {
  admin: "Admin",
  member: "No CMS access",
} as const;
export type UserRole = keyof typeof USER_ROLES;
export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  role: UserRole;
  admin_capabilities: string[] | null;
  created_at: string;
};
export type UserList = {
  users: ManagedUser[];
  total: number;
  pages: number;
  page: number;
};
export type UserInput = {
  email: string;
  fullName: string;
  username: string;
  role: UserRole;
  fullAccess: boolean;
  capabilities: string[];
  password: string;
};
export type UserResult =
  { error: string } | { id: string; message: string; warning?: string };

export function userListParams(
  params: Record<string, string | string[] | undefined>,
) {
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const role =
    typeof params.role === "string" && Object.hasOwn(USER_ROLES, params.role)
      ? (params.role as UserRole)
      : "";
  const raw = typeof params.page === "string" ? Number(params.page) : 1;
  const page =
    Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 1000000) : 1;
  return { q, role, page };
}
export function usersHref(q: string, role: string, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (role) params.set("role", role);
  if (page > 1) params.set("page", String(page));
  return `/admin/users/${params.size ? `?${params}` : ""}`;
}
export function validateUser(
  input: UserInput,
  creating: boolean,
):
  | { error: string }
  | { value: UserInput; capabilities: AdminCapability[] | null } {
  if (typeof input.fullAccess !== "boolean")
    return { error: "Choose valid admin permissions." };
  const value = {
    ...input,
    email: String(input.email).trim().toLowerCase(),
    fullName: String(input.fullName).trim(),
    username: String(input.username).trim().toLowerCase(),
  };
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
    value.email.length > 254
  )
    return { error: "Enter a valid email address." };
  if (value.fullName.length > 150)
    return { error: "Name must be 150 characters or fewer." };
  if (value.username && !/^[a-z0-9_.-]{3,32}$/.test(value.username))
    return {
      error:
        "Username must be 3–32 letters, numbers, dots, underscores or hyphens.",
    };
  if (!Object.hasOwn(USER_ROLES, value.role))
    return { error: "Choose a valid role." };
  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.some((cap) => !Object.hasOwn(ADMIN_CAPABILITIES, cap))
  )
    return { error: "Choose valid admin permissions." };
  if (
    (creating || value.password) &&
    (typeof value.password !== "string" ||
      value.password.length < 12 ||
      value.password.length > 128)
  )
    return { error: "Password must be 12–128 characters." };
  return {
    value,
    capabilities: cleanAdminCapabilities(
      value.role,
      value.fullAccess,
      value.capabilities,
    ),
  };
}
