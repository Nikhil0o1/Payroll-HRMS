import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { CalendarCheck2, CalendarPlus, Check, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LeaveBadge } from "@/components/status-badge";
import { RejectReasonDialog } from "@/components/reject-reason-dialog";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { LeaveBalance, LeaveRequest, LeaveStatus, LeaveType, Page } from "@/types/api";

const applySchema = z
  .object({
    leave_type_id: z.coerce.number().int().positive(),
    start_date: z.string().min(1, "Required"),
    end_date: z.string().min(1, "Required"),
    half_day: z.boolean().default(false),
    reason: z.string().min(4, "Reason must be at least 4 characters").max(500),
  })
  .refine((d) => d.end_date >= d.start_date, { message: "End date cannot be before start", path: ["end_date"] });

type ApplyValues = z.infer<typeof applySchema>;

export function LeavesPage() {
  const me = useAuthStore((s) => s.me);
  const isAdmin = rolesAtLeast(me?.role, "HR_ADMIN");
  // Only users linked to an employee record have personal ("My requests") leave.
  // Pure-admin accounts (e.g. system admin) just review approvals.
  const hasMine = !!me?.employee;
  // Default is derived from role so it stays correct once `me` loads
  // (a fixed initial useState value would lock in before the role is known).
  const [tab, setTab] = useState<string | null>(null);
  const activeTab = tab ?? (isAdmin ? "approvals" : "mine");

  return (
    <>
      <PageHeader
        title="Leaves"
        description="Apply for time off, track balances, and manage approvals."
        icon={CalendarCheck2}
        actions={<ApplyLeaveDialog />}
      />
      <BalanceGrid />
      <Tabs value={activeTab} onValueChange={setTab} className="mt-6">
        <TabsList>
          {hasMine ? <TabsTrigger value="mine">My requests</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="approvals">Approvals</TabsTrigger> : null}
        </TabsList>
        {hasMine ? (
          <TabsContent value="mine">
            <RequestsTable scope="self" allowCancel />
          </TabsContent>
        ) : null}
        {isAdmin ? (
          <TabsContent value="approvals">
            <RequestsTable scope="all" canDecide />
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}

function BalanceGrid() {
  const me = useAuthStore((s) => s.me);
  const q = useQuery({
    queryKey: ["leaves", "balances"],
    queryFn: async () => (await api.get<LeaveBalance[]>("/leaves/balances")).data,
    enabled: !!me?.employee,
  });

  if (!me?.employee) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {q.isLoading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)
      ) : (q.data ?? []).length === 0 ? (
        <Card className="p-5 sm:col-span-2 lg:col-span-3">
          <span className="text-sm text-muted-foreground">No leave types configured.</span>
        </Card>
      ) : (
        q.data!.map((b) => <BalanceCard key={b.id} balance={b} />)
      )}
    </div>
  );
}

function BalanceCard({ balance: b }: { balance: LeaveBalance }) {
  const allotted = b.allotted || 0;
  const pct = allotted > 0 ? (b.available / allotted) * 100 : 0;
  const accent = b.leave_type?.color ?? undefined;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
            style={accent ? { backgroundColor: accent } : undefined}
          />
          <span className="truncate text-sm font-medium">
            {b.leave_type?.name ?? b.leave_type?.code ?? `Type #${b.leave_type_id}`}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{b.year}</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <span className="text-3xl font-semibold tabular-nums">{b.available}</span>
          <span className="ml-1 text-sm text-muted-foreground">/ {allotted} days</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">available</span>
      </div>
      <Progress value={pct} className="mt-3" color={accent} />
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Used <span className="font-medium text-foreground tabular-nums">{b.used}</span>
        </span>
        <span className="text-border">·</span>
        <span>
          Pending <span className="font-medium text-foreground tabular-nums">{b.pending}</span>
        </span>
      </div>
    </Card>
  );
}

function ApplyLeaveDialog() {
  const me = useAuthStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const types = useQuery({
    queryKey: ["leaves", "types"],
    queryFn: async () => (await api.get<LeaveType[]>("/leaves/types")).data,
  });

  const form = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      leave_type_id: 0,
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(new Date(), "yyyy-MM-dd"),
      half_day: false,
      reason: "",
    },
  });

  const submit = useMutation({
    mutationFn: async (values: ApplyValues) => (await api.post("/leaves/requests", values)).data,
    onSuccess: () => {
      toast.success("Leave request submitted");
      qc.invalidateQueries({ queryKey: ["leaves"] });
      setOpen(false);
      form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (!me?.employee) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus className="h-4 w-4" />
          Apply leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>Submit a request for review by your manager.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => submit.mutate(v))}>
          <div className="space-y-1.5">
            <Label>Leave type</Label>
            <Select
              value={String(form.watch("leave_type_id") || "")}
              onValueChange={(v) => form.setValue("leave_type_id", Number(v), { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a leave type" />
              </SelectTrigger>
              <SelectContent>
                {types.data?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.leave_type_id ? (
              <p className="text-xs text-destructive">Choose a leave type</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">From</Label>
              <Input id="start_date" type="date" {...form.register("start_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">To</Label>
              <Input id="end_date" type="date" {...form.register("end_date")} />
            </div>
          </div>
          {form.formState.errors.end_date ? (
            <p className="text-xs text-destructive -mt-2">{form.formState.errors.end_date.message}</p>
          ) : null}
          <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
            <input type="checkbox" {...form.register("half_day")} className="h-4 w-4 accent-primary" />
            Half-day request (single date)
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" rows={3} {...form.register("reason")} />
            {form.formState.errors.reason ? (
              <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submit.isPending}>
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_OPTIONS: { value: LeaveStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

function RequestsTable({
  scope,
  canDecide,
  allowCancel,
}: {
  scope: "self" | "all";
  canDecide?: boolean;
  allowCancel?: boolean;
}) {
  const [status, setStatus] = useState<LeaveStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["leaves", "requests", scope, status, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, size: 20 };
      if (scope === "self") params.scope = "self";
      if (status !== "ALL") params.status = status;
      return (await api.get<Page<LeaveRequest>>("/leaves/requests", { params })).data;
    },
  });
  const types = useQuery({
    queryKey: ["leaves", "types"],
    queryFn: async () => (await api.get<LeaveType[]>("/leaves/types")).data,
  });
  const typeMap = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);

  const decide = useMutation({
    mutationFn: async ({ id, action, note }: { id: number; action: "approve" | "reject"; note?: string }) =>
      (await api.post(`/leaves/requests/${id}/${action}`, { decision_note: note ?? null })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Decision saved");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // Reject-with-reason dialog state
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    await decide.mutateAsync({ id: rejectTarget.id, action: "reject", note: reason });
    setRejectTarget(null);
  }

  const cancel = useMutation({
    mutationFn: async (id: number) => (await api.post(`/leaves/requests/${id}/cancel`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Cancelled");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const colSpan = canDecide ? 7 : 6;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{canDecide ? "All leave requests" : "My leave requests"}</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </div>
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
        />
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              {canDecide ? <TableHead>Employee</TableHead> : null}
              <TableHead>Type</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colSpan}>
                    <Skeleton className="h-7" />
                  </TableCell>
                </TableRow>
              ))
            ) : (q.data?.items ?? []).length === 0 ? (
              <TableEmpty
                colSpan={colSpan}
                message={canDecide ? "No leave requests to review." : "You haven't applied for any leave yet."}
              />
            ) : (
              q.data!.items.map((r) => {
                const type = typeMap.get(r.leave_type_id);
                return (
                  <TableRow key={r.id}>
                    {canDecide ? (
                      <TableCell>
                        <div className="font-medium leading-tight">
                          {r.employee_name ?? `#${r.employee_id}`}
                        </div>
                        {r.employee_code ? (
                          <div className="font-mono text-xs text-muted-foreground">{r.employee_code}</div>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                        <span
                          className={cn("h-2 w-2 shrink-0 rounded-full bg-primary", !type?.color && "")}
                          style={type?.color ? { backgroundColor: type.color } : undefined}
                        />
                        {type?.code ?? `#${r.leave_type_id}`}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {format(parseISO(r.start_date), "d MMM")} – {format(parseISO(r.end_date), "d MMM")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.days}
                      {r.half_day ? <span className="ml-1 text-xs text-muted-foreground">½</span> : null}
                    </TableCell>
                    <TableCell>
                      <LeaveBadge status={r.status} />
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="space-y-1 text-sm">
                        <div className="truncate text-muted-foreground" title={r.reason ?? undefined}>
                          {r.reason ?? "—"}
                        </div>
                        {r.status === "REJECTED" && r.decision_note ? (
                          <div
                            className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive"
                            title={r.decision_note}
                          >
                            <X className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">
                              <span className="font-semibold">Rejected:</span> {r.decision_note}
                            </span>
                          </div>
                        ) : r.status === "APPROVED" && r.decision_note ? (
                          <div
                            className="flex items-start gap-1.5 rounded-md border border-success/30 bg-success/5 px-2 py-1 text-xs text-success"
                            title={r.decision_note}
                          >
                            <Check className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">
                              <span className="font-semibold">Note:</span> {r.decision_note}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canDecide && r.status === "PENDING" ? (
                          <>
                            <Button
                              size="sm"
                              variant="success"
                              loading={decide.isPending && decide.variables?.id === r.id && decide.variables?.action === "approve"}
                              onClick={() => decide.mutate({ id: r.id, action: "approve" })}
                            >
                              <Check className="h-4 w-4" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={decide.isPending && rejectTarget?.id === r.id}
                              onClick={() => setRejectTarget(r)}
                            >
                              <X className="h-4 w-4" /> Reject
                            </Button>
                          </>
                        ) : null}
                        {allowCancel && (r.status === "PENDING" || r.status === "APPROVED") ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={cancel.isPending && cancel.variables === r.id}
                            onClick={() => cancel.mutate(r.id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                        {!(canDecide && r.status === "PENDING") &&
                        !(allowCancel && (r.status === "PENDING" || r.status === "APPROVED")) ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {q.data && q.data.pages > 1 ? (
          <div className="mt-4 flex items-center justify-end gap-2 px-6 text-sm">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="self-center px-2 text-muted-foreground tabular-nums">
              Page {q.data.page} / {q.data.pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= q.data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardContent>

      <RejectReasonDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRejectTarget(null);
        }}
        title="Reject leave request"
        description="Tell the employee why this leave is being declined. They will see this note on their request."
        subjectLabel={
          rejectTarget
            ? [
                typeMap.get(rejectTarget.leave_type_id)?.name ?? `Type #${rejectTarget.leave_type_id}`,
                `${format(parseISO(rejectTarget.start_date), "d MMM")} – ${format(parseISO(rejectTarget.end_date), "d MMM")}`,
                rejectTarget.employee_name ?? `#${rejectTarget.employee_id}`,
              ].join(" · ")
            : undefined
        }
        loading={decide.isPending}
        onConfirm={confirmReject}
      />
    </Card>
  );
}
