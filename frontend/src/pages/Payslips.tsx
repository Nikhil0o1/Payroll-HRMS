import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarDays, Download, ReceiptText, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { api, apiErrorMessage } from "@/lib/api";
import { cn, formatCurrency, monthLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { Payslip, PayrollRun } from "@/types/api";

export function PayslipsPage() {
  const me = useAuthStore((s) => s.me);
  const slips = useQuery({
    queryKey: ["payslips", "me"],
    queryFn: async () => (await api.get<Payslip[]>("/payroll/payslips/me")).data,
    enabled: !!me?.employee,
  });

  const runIds = Array.from(new Set((slips.data ?? []).map((s) => s.run_id)));
  const runs = useQuery({
    queryKey: ["runs", "for-slips", runIds],
    queryFn: async () => {
      const res = await Promise.all(
        runIds.map((id) => api.get<PayrollRun>(`/payroll/runs/${id}`).then((r) => r.data).catch(() => null)),
      );
      const map = new Map<number, PayrollRun>();
      res.forEach((r) => r && map.set(r.id, r));
      return map;
    },
    enabled: runIds.length > 0,
  });

  async function download(detailId: number, label: string) {
    try {
      const r = await api.get(`/payroll/payslips/detail/${detailId}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      const ext = String(r.headers["content-type"] ?? "").includes("pdf") ? "pdf" : "html";
      a.download = `payslip_${label}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  if (!me?.employee) {
    return (
      <>
        <PageHeader
          icon={ReceiptText}
          eyebrow="Payslips"
          title="Payslips"
          description="Your monthly payslip history."
        />
        <EmptyState
          icon={ReceiptText}
          title="No payslips"
          description="This account isn't linked to an employee, so there are no payslips to show."
        />
      </>
    );
  }

  const allSlips = slips.data ?? [];

  // Most recent payslip with a resolved net-pay figure, for the hero stat.
  const latestNet = (() => {
    for (const p of allSlips) {
      const run = runs.data?.get(p.run_id);
      const detail = run?.details?.find((d) => d.employee_id === p.employee_id);
      if (detail) return formatCurrency(detail.net_pay);
    }
    return "—";
  })();

  return (
    <>
      <PageHeader
        icon={ReceiptText}
        eyebrow="Payslips"
        title="Payslips"
        description="Your monthly payslip history. Download anytime."
      />

      {slips.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[104px] rounded-xl" />
          <Skeleton className="h-[104px] rounded-xl" />
        </div>
      ) : allSlips.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Latest net pay"
            value={latestNet}
            tone="success"
            icon={Wallet}
            hint="Most recent payslip"
          />
          <StatCard
            label="Payslips available"
            value={allSlips.length}
            tone="primary"
            icon={ReceiptText}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {slips.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : allSlips.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No payslips yet"
              description="Your payslips will appear here once payroll is finalized."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {allSlips.map((p) => {
                const run = runs.data?.get(p.run_id);
                const detail = run?.details?.find((d) => d.employee_id === p.employee_id);
                const label = run ? `${run.period_year}_${run.period_month}` : `${p.run_id}`;
                const period = run
                  ? monthLabel(run.period_year, run.period_month)
                  : `Run #${p.run_id}`;
                return (
                  <div
                    key={p.id}
                    className="group flex flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium leading-tight">{period}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.generated_at
                              ? format(parseISO(p.generated_at), "d MMM yyyy")
                              : "Pending"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Net pay
                        </p>
                        <p
                          className={cn(
                            "text-lg font-semibold tabular-nums",
                            detail ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          {detail ? formatCurrency(detail.net_pay) : "—"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => download(p.payroll_detail_id, label)}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
