import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
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
import { cn, formatCompactCurrency, formatCurrency, monthLabel } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { PayrollRun } from "@/types/api";

export function PayrollRunPage() {
  const { id } = useParams();
  const runId = Number(id);
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.me);
  const isSuper = rolesAtLeast(me?.role, "SUPER_ADMIN");

  const [expanded, setExpanded] = useState<number | null>(null);

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
                <>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross</p>
                  <p
                    className="text-base font-semibold tabular-nums leading-tight"
                    title={formatCurrency(grossNum)}
                  >
                    {formatCompactCurrency(grossNum)}
                  </p>
                </>
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
                  <TableHead className="w-8" />
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
                  <TableEmpty colSpan={8} message="No employees in this run." />
                ) : (
                  details.map((d) => {
                    const open = expanded === d.id;
                    return (
                      <Fragment key={d.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpanded(open ? null : d.id)}
                        >
                          <TableCell className="text-muted-foreground">
                            {open ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
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
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {run.status === "LOCKED" ? (
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
                            ) : (
                              // Payslips become available only after the run
                              // is LOCKED. Show a muted lock badge so the
                              // column doesn't go empty (avoids reflow when
                              // the run is later locked), with a tooltip
                              // explaining the current state.
                              <SimpleTooltip
                                label={`Payslip available after the run is locked (currently ${run.status.toLowerCase()})`}
                              >
                                <span className="inline-grid h-8 w-8 place-items-center rounded-md border border-dashed border-border text-muted-foreground/60">
                                  <Lock className="h-3.5 w-3.5" />
                                </span>
                              </SimpleTooltip>
                            )}
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={8} className="p-0">
                              <div className="grid gap-5 p-4 md:grid-cols-3">
                                <BreakdownCol title="Attendance">
                                  <KV label="Working days (month)" value={fmtDays(d.working_days)} />
                                  <KV label="Present" value={fmtDays(d.present_days)} />
                                  <KV label="Paid leave" value={fmtDays(d.paid_leave_days)} />
                                  <KV
                                    label="LOP (absent)"
                                    value={fmtDays(d.lop_days)}
                                    tone={d.lop_days > 0 ? "danger" : undefined}
                                  />
                                  <KV label="Payable days" value={fmtDays(d.payable_days)} strong border />
                                </BreakdownCol>

                                <BreakdownCol title="Earnings">
                                  {d.earnings.map((e) => (
                                    <KV key={e.code} label={e.name} value={formatCurrency(e.amount)} />
                                  ))}
                                  <KV label="Gross" value={formatCurrency(d.gross)} strong border />
                                </BreakdownCol>

                                <BreakdownCol title="Deductions">
                                  {d.deductions.length ? (
                                    d.deductions.map((dd) => (
                                      <KV key={dd.code} label={dd.name} value={formatCurrency(dd.amount)} />
                                    ))
                                  ) : (
                                    <p className="py-1 text-xs text-muted-foreground">No deductions</p>
                                  )}
                                  <KV
                                    label="Total deductions"
                                    value={formatCurrency(d.total_deductions)}
                                    border
                                  />
                                  <KV
                                    label="Net pay"
                                    value={formatCurrency(d.net_pay)}
                                    strong
                                    tone="success"
                                  />
                                </BreakdownCol>
                              </div>
                              <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                                Each component is pro-rated by{" "}
                                <span className="font-medium text-foreground">
                                  payable ÷ working days = {fmtDays(d.payable_days)} ÷{" "}
                                  {fmtDays(d.working_days)}
                                </span>
                                . Net pay = gross − total deductions.
                              </p>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
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

/** Days as a compact string (keeps 0.5 for half days). */
function fmtDays(n: number): string {
  return String(n);
}

function BreakdownCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function KV({
  label,
  value,
  strong,
  border,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  border?: boolean;
  tone?: "danger" | "success";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-0.5 text-sm",
        border && "mt-1 border-t border-border pt-1.5",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "font-semibold" : "font-medium",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </span>
    </div>
  );
}
