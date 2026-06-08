/**
 * Company-domain allow-list helpers + the `useAuthPolicy` hook.
 *
 * The backend exposes `/auth/policy` publicly so the Login / Signup pages
 * can render a domain-aware hint and validate inline. Everywhere we touch
 * email input we should use these helpers — keeps casing, leading `@`, and
 * the user-facing message consistent with the server.
 */
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AuthPolicy } from "@/types/api";

const POLICY_KEY = ["auth", "policy"] as const;

export function useAuthPolicy() {
  return useQuery({
    queryKey: POLICY_KEY,
    queryFn: async () => (await api.get<AuthPolicy>("/auth/policy")).data,
    // The policy is configuration — it changes on a redeploy, not on every
    // mount. Cache aggressively so we don't fire a request on every page.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    // Don't block the page if the policy endpoint is unreachable — fall back
    // to "no restriction" client-side. The server still has the final say.
    refetchOnWindowFocus: false,
  });
}

export function normalizeDomain(d: string): string {
  let v = (d ?? "").trim().toLowerCase();
  if (v.startsWith("@")) v = v.slice(1);
  return v;
}

export function emailDomain(email: string): string {
  const e = (email ?? "").trim().toLowerCase();
  const i = e.lastIndexOf("@");
  return i >= 0 ? e.slice(i + 1) : "";
}

export function isEmailDomainAllowed(
  email: string,
  domains: readonly string[] | undefined,
): boolean {
  if (!domains || domains.length === 0) return true;
  const allowed = domains.map(normalizeDomain).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(emailDomain(email));
}

/** "@a.com" · "@a.com or @b.com" · "@a.com, @b.com, or @c.com" */
export function formatAllowedDomains(
  domains: readonly string[] | undefined,
): string {
  if (!domains || domains.length === 0) return "";
  const list = domains.map(normalizeDomain).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return `@${list[0]}`;
  if (list.length === 2) return `@${list[0]} or @${list[1]}`;
  const head = list.slice(0, -1).map((d) => `@${d}`).join(", ");
  return `${head}, or @${list[list.length - 1]}`;
}

/** Standard hint copy for input helper text — null when no policy applies. */
export function workEmailHint(
  domains: readonly string[] | undefined,
): string | null {
  const pretty = formatAllowedDomains(domains);
  return pretty ? `Use your company email (${pretty})` : null;
}

/** Standard error message used by every Zod refinement on email fields. */
export function workEmailErrorMessage(
  domains: readonly string[] | undefined,
): string {
  const pretty = formatAllowedDomains(domains);
  return pretty
    ? `Email must use your company domain (${pretty}).`
    : "Email must use a permitted company domain.";
}
