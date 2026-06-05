import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Lock,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollStatusBadge } from "@/components/status-badge";
import { api, apiErrorMessage } from "@/lib/api";
import { cn, formatCurrency, monthLabel } from "@/lib/utils";
import type { Page, PayrollRun } from "@/types/api";

const schema = z.object({
  period_year: z.coerce.number().int().min(2000).max(2100),
  period_month: z.coerce.number().int().min(1).max(12),
});
type Values = z.infer<typeof schema>;

export function PayrollPage() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("run");
  const q = useQuery({
    queryKey: ["payroll", "runs", page],
    queryFn: async () =>
      (await api.get<Page<PayrollRun>>("/payroll/runs", { params: { page, size: 12 } })).data,
  });

  const items = q.data?.items ?? [];
  const featured = items[0];

  return (
    <>
      <PageHeader
        icon={Wallet}
        eyebrow="Payroll"
        title="Pay Runs"
        description="Process, review, approve and lock monthly payroll."
        actions={<NewRunDialog />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="run">Run Payroll</TabsTrigger>
          <TabsTrigger value="history">Payroll History</TabsTrigger>
        </TabsList>

        {/* Run Payroll — current / latest run */}
        <TabsContent value="run">
          {q.isLoading ? (
            <Skeleton className="h-[180px] rounded-xl" />
          ) : featured ? (
            <Card className="overflow-hidden">
              <div className="border-l-[3px] border-primary">
                <div className="flex flex-col gap-1 border-b bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Process Pay Run for
                      </p>
                      <p className="truncate text-lg font-semibold tracking-tight">
                        {monthLabel(featured.period_year, featured.period_month)}
                      </p>
                    </div>
                    <PayrollStatusBadge status={featured.status} />
                  </div>
                  <Button asChild>
                    <Link to={`/payroll/runs/${featured.id}`}>
                      Open Pay Run <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
                  <SummaryTile label="Net pay" value={formatCurrency(featured.total_net)} tone="success" icon={Wallet} />
                  <SummaryTile label="Gross" value={formatCurrency(featured.total_gross)} tone="primary" icon={TrendingDown} />
                  <SummaryTile label="Deductions" value={formatCurrency(featured.total_deductions)} tone="warning" icon={TrendingDown} />
                  <SummaryTile label="Employees" value={featured.employee_count} tone="info" icon={Users} />
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4">
                <EmptyState
                  icon={Wallet}
                  title="No payroll runs yet"
                  description="Create your first run to calculate pay for active employees."
                  action={<NewRunDialog />}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Payroll History — all runs */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle>{q.data?.total ?? 0} payroll runs</CardTitle>
                <CardDescription>Most recent first</CardDescription>
              </div>
              {q.data && q.data.pages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {page} / {q.data.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= q.data.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="pt-0">
              {q.isLoading ? (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No payroll runs yet"
                  description="Create your first run to calculate pay for active employees."
                  action={<NewRunDialog />}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Employees</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Locked</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r.id} className="group cursor-pointer">
                        <TableCell>
                          <Link
                            to={`/payroll/runs/${r.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {monthLabel(r.period_year, r.period_month)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <PayrollStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.employee_count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(r.total_gross)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(r.total_deductions)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-success">
                          {formatCurrency(r.total_net)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.locked_at ? (
                            <span className="inline-flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              {format(parseISO(r.locked_at), "d MMM yyyy")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            to={`/payroll/runs/${r.id}`}
                            className="text-muted-foreground transition-colors group-hover:text-primary"
                            aria-label="Open run"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

const tileTone: Record<string, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  info: "bg-info/12 text-info",
};

function SummaryTile({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof tileTone;
  icon: typeof Wallet;
}) {
  return (
    <div className="flex items-start justify-between gap-3 bg-card p-5">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      </div>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          tileTone[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}

function NewRunDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { period_year: today.getFullYear(), period_month: today.getMonth() + 1 },
  });

  const create = useMutation({
    mutationFn: async (v: Values) => (await api.post<PayrollRun>("/payroll/runs", v)).data,
    onSuccess: (r) => {
      toast.success(`Created run for ${monthLabel(r.period_year, r.period_month)}`);
      qc.invalidateQueries({ queryKey: ["payroll"] });
      setOpen(false);
      navigate(`/payroll/runs/${r.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Wallet className="h-4 w-4" /> Run payroll
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run payroll</DialogTitle>
          <DialogDescription>
            This calculates pay for all active employees in the period.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select
                value={String(form.watch("period_year"))}
                onValueChange={(v) => form.setValue("period_year", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(
                    (y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select
                value={String(form.watch("period_month"))}
                onValueChange={(v) => form.setValue("period_month", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {monthLabel(2024, i + 1).split(" ")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>
              A draft run is created and pay is computed for every active employee. You can review,
              recompute, approve and lock it afterwards.
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
