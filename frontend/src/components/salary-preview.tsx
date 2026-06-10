import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { EmploymentType, SalaryPreview } from "@/types/api";

/** Live monthly salary breakdown for an employment type + Annual CTC, computed
 * server-side from that type's components. Shared by the onboarding wizard and
 * the employee detail "generate salary" dialog. */
export function useSalaryPreview(
  employmentType: EmploymentType,
  ctcAnnual: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["salary-preview", employmentType, ctcAnnual],
    queryFn: async () =>
      (
        await api.post<SalaryPreview>("/salary-structures/preview", {
          employment_type: employmentType,
          ctc_annual: ctcAnnual,
        })
      ).data,
    enabled: enabled && ctcAnnual > 0,
  });
}

export function SalaryPreviewCard({
  preview,
  loading,
}: {
  preview?: SalaryPreview;
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-44 w-full rounded-lg" />;
  if (!preview) return null;

  if (preview.component_count === 0) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
        No salary components are configured for this employment type. Add them in{" "}
        <span className="font-medium">Settings → Salary Components</span> — otherwise the structure
        is just Basic ({formatCurrency(preview.basic_monthly)}/month).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Column title="Earnings" lines={preview.earnings} total={preview.gross} totalLabel="Gross" />
        <Column
          title="Deductions"
          lines={preview.deductions}
          total={preview.total_deductions}
          totalLabel="Total"
          empty="No deductions"
        />
      </div>
      <div className="flex items-center justify-between bg-success/8 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Monthly net pay
        </span>
        <span className="text-lg font-semibold tabular-nums text-success">
          {formatCurrency(preview.net)}
        </span>
      </div>
    </div>
  );
}

function Column({
  title,
  lines,
  total,
  totalLabel,
  empty,
}: {
  title: string;
  lines: { code: string; name: string; amount: number }[];
  total: number;
  totalLabel: string;
  empty?: string;
}) {
  return (
    <div className="p-3.5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {lines.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">{empty ?? "—"}</p>
        ) : (
          lines.map((l) => (
            <div key={l.code} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground">{l.name}</span>
              <span className="tabular-nums">{formatCurrency(l.amount)}</span>
            </div>
          ))
        )}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1.5 text-sm font-semibold">
          <span>{totalLabel}</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
