// Username resolution stays on the server; callers never receive the account email.
export async function resolveLoginEmail(
  identifier: string,
  lookupUsername: (username: string) => Promise<string | null>,
): Promise<string | null> {
  const value = identifier.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  if (value.includes("@")) return value;
  if (!/^[a-z0-9_.-]{3,32}$/.test(value)) return null;
  return lookupUsername(value);
}

export function exactUsernamePattern(username: string) {
  return username.replace(/[\\%_]/g, "\\$&");
}
