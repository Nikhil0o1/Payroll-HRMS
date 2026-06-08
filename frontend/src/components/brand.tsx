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
const BRAND_DIM = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-12 w-12" } as const;
const BRAND_GLYPH = { sm: "h-4 w-4", md: "h-[18px] w-[18px]", lg: "h-7 w-7" } as const;

export function BrandMark({
  branding,
  variant = "dark",
  size = "md",
}: {
  branding?: OrganisationBranding;
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const dim = BRAND_DIM[size];
  if (branding?.logo_key) {
    return (
      <div
        className={cn(
          "shrink-0 overflow-hidden grid place-items-center shadow-card ring-1 ring-black/5",
          size === "lg" ? "rounded-xl" : "rounded-lg",
          dim,
          variant === "dark" ? "bg-white" : "bg-card",
        )}
      >
        <img
          src={branding.logo_key}
          alt={branding.name}
          className={cn("h-full w-full object-contain", size === "lg" ? "p-1" : "p-0.5")}
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
      <Wallet className={BRAND_GLYPH[size]} />
    </div>
  );
}
