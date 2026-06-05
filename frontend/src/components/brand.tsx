import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { OrganisationBranding } from "@/types/api";

/** Fetches the lightweight name + logo payload powering the app shell.
 * Available to every authenticated user (employees included). */
export function useOrgBranding() {
  return useQuery({
    queryKey: ["org", "branding"],
    queryFn: async () =>
      (await api.get<OrganisationBranding>("/settings/organisation/branding")).data,
    staleTime: 60_000,
  });
}

/** App-shell brand mark — shows the org logo when uploaded, otherwise the
 * blue tile + wallet glyph (Zoho-style fallback). */
export function BrandMark({
  branding,
  variant = "dark",
  size = "md",
}: {
  branding?: OrganisationBranding;
  variant?: "dark" | "light";
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  if (branding?.logo_key) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-lg overflow-hidden grid place-items-center shadow-soft",
          dim,
          variant === "dark" ? "bg-white" : "bg-card",
        )}
      >
        <img
          src={branding.logo_key}
          alt={branding.name}
          className="h-full w-full object-contain p-0.5"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "shrink-0 rounded-lg bg-primary text-white grid place-items-center shadow-soft",
        dim,
      )}
    >
      <Wallet className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </div>
  );
}
