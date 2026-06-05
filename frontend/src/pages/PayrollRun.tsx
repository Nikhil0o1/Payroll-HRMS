import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Download,
  Lock,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/charts";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { PayrollStatusBadge } from "@/components/status-badge";
import { api, apiErrorMessage } from "@/lib/api";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { PayrollRun } from "@/types/api";

export function PayrollRunPage() {
  const { id } = useParams();
  const runId = Number(id);
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.me);
  const isSuper = rolesAtLeast(me?.role, "SUPER_ADMIN");

  const q = useQuery({
    queryKey: ["payroll", "run", runId],
    queryFn: async () => (await api.get<PayrollRun>(`/payroll/runs/${runId}`)).data,
    enabled: Number.isFinite(runId),
  });

  const action = useMutation({
    mutationFn: async (act: "recompute" | "submit" | "approve" | "reopen" | "lock") =>
      (await api.post<PayrollRun>(`/payroll/runs/${runId}/${act}`)).data,
    onSuccess: () => {
      toast.success("Run updated");
      qc.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const deleteRun = useMutation({
    mutationFn: async () => (await api.delete(`/payroll/runs/${runId}`)).data,
    onSuccess: () => {
      toast.success("Run deleted");
      qc.invalidateQueries({ queryKey: ["payroll"] });
      window.history.back();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  async function downloadReport() {
    try {
      const r = await api.get(`/reports/payroll`, {
        params: { run_id: runId },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_run_${runId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function downloadSlip(detailId: number, label: string) {
    try {
      const r = await api.get(`/payroll/payslips/detail/${detailId}/download`, { responseType: "blob" });
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

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!q.data) return <p>Run not found</p>;
  const run = q.data;

  const canSubmit = run.status === "DRAFT";
  const canApprove = run.status === "REVIEW";
  const canLock = run.status === "APPROVED" && isSuper;
  const canReopen = run.status === "REVIEW" || run.status === "APPROVED";
  const canRecompute = run.status !== "LOCKED";
  const canDelete = run.status === "DRAFT";

  const details = run.details ?? [];
  const grossNum = Number(run.total_gross) || 0;
  const dedNum = Number(run.total_deductions) || 0;
  const netNum = Number(run.total_net) || 0;
  const donutData = [
    { name: "Net pay", value: netNum, color: "hsl(var(--success))" },
    { name: "Deductions", value: dedNum, color: "hsl(var(--warning))" },
  ];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link to="/payroll">
          <ArrowLeft className="h-4 w-4" /> Back to payroll
        </Link>
      </Button>
      <PageHeader
        icon={Wallet}
        eyebrow="Payroll run"
        title={monthLabel(run.period_year, run.period_month)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PayrollStatusBadge status={run.status} />
            {run.locked_at ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Locked {format(parseISO(run.locked_at), "d MMM yyyy, HH:mm")}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            {canRecompute ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => action.mutate("recompute")}
                loading={action.isPending}
              >
                <RefreshCw className="h-4 w-4" /> Recompute
              </Button>
            ) : null}
            {canSubmit ? (
              <Button size="sm" onClick={() => action.mutate("submit")} loading={action.isPending}>
                <Send className="h-4 w-4" /> Submit for review
              </Button>
            ) : null}
            {canApprove ? (
              <Button
                variant="success"
                size="sm"
                onClick={() => action.mutate("approve")}
                loading={action.isPending}
              >
                <ShieldCheck className="h-4 w-4" /> Approve
              </Button>
            ) : null}
            {canLock ? (
              <Button size="sm" onClick={() => action.mutate("lock")} loading={action.isPending}>
                <Lock className="h-4 w-4" /> Lock
              </Button>
            ) : null}
            {canReopen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => action.mutate("reopen")}
                loading={action.isPending}
              >
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={downloadReport}>
              <Download className="h-4 w-4" /> Excel
            </Button>
            {canDelete ? (
              <SimpleTooltip label="Delete draft run">
                <Button variant="ghost" size="icon" onClick={() => deleteRun.mutate()}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Gross" value={formatCurrency(run.total_gross)} tone="primary" icon={Wallet} />
        <StatCard
          label="Deductions"
          value={formatCurrency(run.total_deductions)}
          tone="warning"
          icon={RefreshCw}
        />
        <StatCard
          label="Net pay"
          value={formatCurrency(run.total_net)}
          tone="success"
          icon={Wallet}
        />
        <StatCard label="Employees" value={run.employee_count} tone="info" icon={Users} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Payout split</CardTitle>
            <CardDescription>Net pay vs deductions</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={donutData}
              valueFormatter={(v) => formatCurrency(v)}
              center={
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Gross</p>
                  <p className="text-lg font-semibold tabular-nums">{formatCurrency(grossNum)}</p>
                </div>
              }
            />
            <div className="mt-4 space-y-2">
              <LegendRow
                color="hsl(var(--success))"
                label="Net pay"
                value={formatCurrency(run.total_net)}
              />
              <LegendRow
                color="hsl(var(--warning))"
                label="Deductions"
                value={formatCurrency(run.total_deductions)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Per-employee breakdown</CardTitle>
            <CardDescription>{details.length} employee snapshot(s)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Working / Payable</TableHead>
                  <TableHead className="text-right">LOP</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Slip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.length === 0 ? (
                  <TableEmpty colSpan={7} message="No employees in this run." />
                ) : (
                  details.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium leading-tight">
                          {d.employee_name ?? `#${d.employee_id}`}
                        </div>
                        {d.employee_code ? (
                          <div className="font-mono text-xs text-muted-foreground">
                            {d.employee_code}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {d.working_days} /{" "}
                        <span className="font-semibold text-foreground">{d.payable_days}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.lop_days > 0 ? (
                          <span className="text-destructive">{d.lop_days}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(d.gross)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(d.total_deductions)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-success">
                        {formatCurrency(d.net_pay)}
                      </TableCell>
                      <TableCell className="text-right">
                        <SimpleTooltip label="Download payslip">
                          <Button
                            size="icon-sm"
                            variant="outline"
                            onClick={() =>
                              downloadSlip(
                                d.id,
                                `${run.period_year}_${run.period_month}_${d.employee_code ?? d.employee_id}`,
                              )
                            }
                            aria-label="Download payslip"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </SimpleTooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{value}</span>
    </div>
  );
}
