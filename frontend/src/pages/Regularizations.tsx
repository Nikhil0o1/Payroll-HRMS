import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { Check, FileEdit, History, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { RegularizationBadge } from "@/components/status-badge";
import { RejectReasonDialog } from "@/components/reject-reason-dialog";
import { api, apiErrorMessage } from "@/lib/api";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type {
  Page,
  RegularizationRequest,
  RegularizationStatus,
  RegularizationType,
} from "@/types/api";

const schema = z.object({
  work_date: z.string().min(1),
  type: z.enum(["MISSING_IN", "MISSING_OUT", "WRONG_TIME", "OTHER"]),
  requested_in: z.string().optional().nullable(),
  requested_out: z.string().optional().nullable(),
  reason: z.string().min(4).max(500),
});
type Values = z.infer<typeof schema>;

const TYPE_LABEL: Record<RegularizationType, string> = {
  MISSING_IN: "Missing punch-in",
  MISSING_OUT: "Missing punch-out",
  WRONG_TIME: "Wrong time",
  OTHER: "Other",
};

export function RegularizationsPage() {
  const me = useAuthStore((s) => s.me);
  const isAdmin = rolesAtLeast(me?.role, "HR_ADMIN");
  // Pure-admin accounts (no employee record) only review; staff also have "My requests".
  const hasMine = !!me?.employee;
  // Derive the default from role so it's correct once `me` resolves.
  const [tab, setTab] = useState<string | null>(null);
  const activeTab = tab ?? (isAdmin ? "approvals" : "mine");

  return (
    <>
      <PageHeader
        title="Regularizations"
        description="Correct missed punches and wrong attendance with admin approval."
        icon={History}
        actions={<RequestDialog />}
      />
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          {hasMine ? <TabsTrigger value="mine">My requests</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="approvals">Approvals</TabsTrigger> : null}
        </TabsList>
        {hasMine ? (
          <TabsContent value="mine">
            <RequestsTable scope="self" />
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

function RequestDialog() {
  const me = useAuthStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      work_date: format(new Date(), "yyyy-MM-dd"),
      type: "MISSING_IN",
      requested_in: "",
      requested_out: "",
      reason: "",
    },
  });
  const type = form.watch("type");
  const wantsIn = type === "MISSING_IN" || type === "WRONG_TIME";
  const wantsOut = type === "MISSING_OUT" || type === "WRONG_TIME";

  const submit = useMutation({
    mutationFn: async (v: Values) => {
      const payload = {
        work_date: v.work_date,
        type: v.type,
        reason: v.reason,
        requested_in: wantsIn && v.requested_in ? `${v.work_date}T${v.requested_in}:00` : null,
        requested_out: wantsOut && v.requested_out ? `${v.work_date}T${v.requested_out}:00` : null,
      };
      return (await api.post("/regularizations", payload)).data;
    },
    onSuccess: () => {
      toast.success("Request submitted");
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      form.reset();
      setOpen(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (!me?.employee) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileEdit className="h-4 w-4" />
          New regularization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New regularization</DialogTitle>
          <DialogDescription>Request a correction for a specific work day.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => submit.mutate(v))}>
          <div className="space-y-1.5">
            <Label htmlFor="work_date">Date</Label>
            <Input id="work_date" type="date" {...form.register("work_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.watch("type")}
              onValueChange={(v) => form.setValue("type", v as Values["type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MISSING_IN">Missing punch-in</SelectItem>
                <SelectItem value="MISSING_OUT">Missing punch-out</SelectItem>
                <SelectItem value="WRONG_TIME">Wrong time</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {wantsIn ? (
              <div className="space-y-1.5">
                <Label htmlFor="requested_in">Requested IN</Label>
                <Input id="requested_in" type="time" {...form.register("requested_in")} />
              </div>
            ) : null}
            {wantsOut ? (
              <div className="space-y-1.5">
                <Label htmlFor="requested_out">Requested OUT</Label>
                <Input id="requested_out" type="time" {...form.register("requested_out")} />
              </div>
            ) : null}
          </div>
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

const STATUS_OPTIONS: { value: RegularizationStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function RequestsTable({ scope, canDecide }: { scope: "self" | "all"; canDecide?: boolean }) {
  const [status, setStatus] = useState<RegularizationStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["regularizations", scope, status, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, size: 20 };
      if (scope === "self") params.scope = "self";
      if (status !== "ALL") params.status = status;
      return (await api.get<Page<RegularizationRequest>>("/regularizations", { params })).data;
    },
  });

  const decide = useMutation({
    mutationFn: async ({
      id,
      action,
      note,
    }: {
      id: number;
      action: "approve" | "reject";
      note?: string;
    }) =>
      (
        await api.post(`/regularizations/${id}/${action}`, {
          decision_note: note ?? null,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      toast.success("Decision saved");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // Reject-with-reason dialog state
  const [rejectTarget, setRejectTarget] = useState<RegularizationRequest | null>(null);
  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    await decide.mutateAsync({ id: rejectTarget.id, action: "reject", note: reason });
    setRejectTarget(null);
  }

  const colSpan = canDecide ? 8 : 7;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{canDecide ? "All requests" : "My requests"}</CardTitle>
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
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Requested in</TableHead>
              <TableHead>Requested out</TableHead>
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
                message={
                  canDecide
                    ? "No regularization requests to review."
                    : "You haven't raised any regularization requests yet."
                }
              />
            ) : (
              q.data!.items.map((r) => (
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
                  <TableCell className="tabular-nums">{format(parseISO(r.work_date), "d MMM yyyy")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABEL[r.type]}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.requested_in ? format(parseISO(r.requested_in), "HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.requested_out ? format(parseISO(r.requested_out), "HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <RegularizationBadge status={r.status} />
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="space-y-1 text-sm">
                      <div className="truncate text-muted-foreground" title={r.reason}>
                        {r.reason}
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
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
        title="Reject regularization request"
        description="Tell the employee why this is being declined. They will see this note on their request."
        subjectLabel={
          rejectTarget
            ? [
                TYPE_LABEL[rejectTarget.type],
                format(parseISO(rejectTarget.work_date), "d MMM yyyy"),
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
