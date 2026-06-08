import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Check,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  LayoutTemplate,
  Mail,
  Phone,
  Plus,
  Power,
  Save,
  ShieldCheck,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/user-avatar";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeStatusBadge } from "@/components/status-badge";
import { api, apiErrorMessage } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type {
  BankAccountReveal,
  BankDetailChangeRequest,
  Employee,
  SalaryStructure,
  SalaryTemplate,
  Shift,
  StepUpToken,
} from "@/types/api";

const editSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  shift_id: z.coerce.number().int().positive().optional(),
  employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
type EditValues = z.infer<typeof editSchema>;

const componentSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["EARNING", "DEDUCTION"]),
  calc: z.enum(["FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_CTC"]),
  value: z.coerce.number().min(0),
});
const salarySchema = z.object({
  effective_from: z.string().min(1),
  ctc_annual: z.coerce.number().min(0),
  basic_monthly: z.coerce.number().min(0),
  components: z.array(componentSchema),
});
type SalaryValues = z.infer<typeof salarySchema>;

const EMPLOYMENT_LABELS: Record<Employee["employment_type"], string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export function EmployeeDetailPage() {
  const { id } = useParams();
  const employeeId = Number(id);
  const me = useAuthStore((s) => s.me);
  const isHR = rolesAtLeast(me?.role, "HR_ADMIN");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => (await api.get<Employee>(`/employees/${employeeId}`)).data,
    enabled: Number.isFinite(employeeId),
  });
  const structures = useQuery({
    queryKey: ["salary-structures", employeeId],
    queryFn: async () => (await api.get<SalaryStructure[]>(`/salary-structures/by-employee/${employeeId}`)).data,
    enabled: Number.isFinite(employeeId) && isHR,
  });
  const shiftsQuery = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await api.get<Shift[]>("/shifts")).data,
    enabled: isHR,
  });
  const bankChanges = useQuery({
    queryKey: ["bank-change-requests", employeeId],
    queryFn: async () =>
      (await api.get<BankDetailChangeRequest[]>(`/employees/${employeeId}/bank-change-requests`)).data,
    enabled: Number.isFinite(employeeId) && isHR,
  });

  const editForm = useForm<EditValues>({ resolver: zodResolver(editSchema) });
  const update = useMutation({
    mutationFn: async (v: EditValues) => (await api.patch(`/employees/${employeeId}`, v)).data,
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["employee", employeeId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const toggleStatus = useMutation({
    mutationFn: async (active: boolean) =>
      (await api.post(`/employees/${employeeId}/${active ? "reactivate" : "deactivate"}`)).data,
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["employee", employeeId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (q.isLoading) return <DetailSkeleton />;
  if (!q.data) {
    return (
      <>
        <BackLink />
        <EmptyState
          icon={User}
          title="Employee not found"
          description="This employee may have been removed or you don't have access."
          action={
            <Button variant="outline" asChild>
              <Link to="/employees">Back to directory</Link>
            </Button>
          }
        />
      </>
    );
  }
  const emp = q.data;
  const contacts = emp.profile?.emergency_contacts ?? [];
  const shifts = shiftsQuery.data ?? [];
  const assignedShift = shifts.find((s) => s.id === emp.shift_id);

  return (
    <>
      <BackLink />

      {/* Profile header */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
          <UserAvatar
            name={`${emp.first_name} ${emp.last_name}`}
            src={emp.photo_url}
            className="h-16 w-16 shrink-0 ring-2 ring-primary/15"
            fallbackClassName="bg-primary/10 text-lg font-semibold text-primary"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {emp.first_name} {emp.last_name}
                  </h2>
                  <EmployeeStatusBadge status={emp.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {emp.designation ?? "—"}
                  {emp.department ? ` · ${emp.department}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {emp.employee_code}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {emp.work_email}
                  </span>
                  {emp.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {emp.phone}
                    </span>
                  ) : null}
                  {assignedShift ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {assignedShift.name}
                    </span>
                  ) : null}
                </div>
              </div>

              {isHR ? (
                <Button
                  size="sm"
                  variant={emp.status === "ACTIVE" ? "outline" : "success"}
                  loading={toggleStatus.isPending}
                  onClick={() => toggleStatus.mutate(emp.status !== "ACTIVE")}
                  className="shrink-0"
                >
                  <Power className="h-4 w-4" />
                  {emp.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                </Button>
              ) : null}
            </div>

            {/* Key facts strip */}
            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <Fact icon={Briefcase} label="Employment" value={EMPLOYMENT_LABELS[emp.employment_type]} />
              <Fact
                icon={CalendarDays}
                label="Joined"
                value={format(parseISO(emp.date_of_joining), "d MMM yyyy")}
              />
              <Fact
                icon={Mail}
                label="Personal email"
                value={emp.personal_email ?? "—"}
              />
              <Fact icon={Phone} label="Phone" value={emp.phone ?? "—"} />
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {isHR ? <TabsTrigger value="employment">Employment</TabsTrigger> : null}
          {isHR ? <TabsTrigger value="salary">Salary</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard icon={User} title="Personal" description="Identity & demographics">
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field
                  label="Date of birth"
                  value={
                    emp.profile?.date_of_birth
                      ? format(parseISO(emp.profile.date_of_birth), "d MMM yyyy")
                      : "—"
                  }
                />
                <Field label="Gender" value={emp.profile?.gender ?? "—"} />
                <Field label="PAN" value={emp.profile?.pan ?? "—"} mono />
                <Field label="Personal email" value={emp.personal_email ?? "—"} />
                <Field label="Address" value={emp.profile?.address ?? "—"} className="sm:col-span-2" />
              </div>
            </SectionCard>

            <SectionCard icon={CreditCard} title="Bank details" description="Payout account">
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <BankDetailsPanel
                  employeeId={employeeId}
                  employee={emp}
                  requests={bankChanges.data ?? []}
                  loadingRequests={bankChanges.isLoading}
                />
              </div>
            </SectionCard>
          </div>

          <SectionCard icon={Phone} title="Emergency contacts" description="Who to reach in an emergency">
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emergency contacts on file.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {contacts.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-muted/30 p-3.5"
                  >
                    <div className="font-medium">{c.name}</div>
                    <Badge variant="secondary" className="mt-1">{c.relationship}</Badge>
                    <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{c.phone}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {isHR ? (
          <TabsContent value="employment">
            <SectionCard
              icon={Briefcase}
              title="Employment"
              description="Department, designation, and type."
            >
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={editForm.handleSubmit((v) => update.mutate(v))}
              >
                <div className="space-y-1.5">
                  <Label>First name</Label>
                  <Input defaultValue={emp.first_name} {...editForm.register("first_name")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input defaultValue={emp.last_name} {...editForm.register("last_name")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Input defaultValue={emp.department ?? ""} {...editForm.register("department")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input defaultValue={emp.designation ?? ""} {...editForm.register("designation")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Employment type</Label>
                  <Select
                    defaultValue={emp.employment_type}
                    onValueChange={(v) => editForm.setValue("employment_type", v as EditValues["employment_type"])}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full-time</SelectItem>
                      <SelectItem value="PART_TIME">Part-time</SelectItem>
                      <SelectItem value="CONTRACT">Contract</SelectItem>
                      <SelectItem value="INTERN">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Shift</Label>
                  <Select
                    defaultValue={emp.shift_id ? String(emp.shift_id) : undefined}
                    onValueChange={(v) => editForm.setValue("shift_id", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts
                        .filter((s) => s.is_active || s.id === emp.shift_id)
                        .map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                            {s.is_active ? "" : " (archived)"}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end justify-end sm:col-span-2">
                  <Button type="submit" loading={update.isPending}>
                    <Save className="h-4 w-4" /> Save changes
                  </Button>
                </div>
              </form>
            </SectionCard>
          </TabsContent>
        ) : null}

        {isHR ? (
          <TabsContent value="salary">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    Salary structures
                  </CardTitle>
                  <CardDescription>Versioned. Latest active applies to payroll.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ApplyTemplateDialog employeeId={employeeId} />
                  <SalaryDialog employeeId={employeeId} latest={structures.data?.[0]} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {(structures.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="No salary structure yet"
                    description="Apply a salary template, or build a one-off structure from scratch."
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <ApplyTemplateDialog employeeId={employeeId} />
                        <SalaryDialog employeeId={employeeId} latest={structures.data?.[0]} />
                      </div>
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Effective</TableHead>
                          <TableHead className="text-right">CTC</TableHead>
                          <TableHead className="text-right">Basic / month</TableHead>
                          <TableHead>Components</TableHead>
                          <TableHead className="text-right">Active?</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {structures.data!.map((s) => (
                          <TableRow key={s.id} className={cn(s.is_active && "bg-success/5")}>
                            <TableCell className="tabular-nums font-medium">
                              {format(parseISO(s.effective_from), "d MMM yyyy")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(s.ctc_annual)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(s.basic_monthly)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {(s.components ?? []).length} component(s)
                            </TableCell>
                            <TableCell className="text-right">
                              {s.is_active ? (
                                <Badge variant="success">Active</Badge>
                              ) : (
                                <Badge variant="muted">Inactive</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
      <Link to="/employees">
        <ArrowLeft className="h-4 w-4" /> Back to employees
      </Link>
    </Button>
  );
}

function DetailSkeleton() {
  return (
    <>
      <Skeleton className="mb-3 h-8 w-40" />
      <Card className="mb-6 p-6">
        <div className="flex gap-5">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-16 w-full rounded-lg" />
          </div>
        </div>
      </Card>
      <Skeleton className="h-9 w-64 rounded-lg" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Briefcase;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Briefcase;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  className = "",
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm font-medium", mono && "font-mono tabular-nums")}>{value}</div>
    </div>
  );
}

function BankDetailsPanel({
  employeeId,
  employee,
  requests,
  loadingRequests,
}: {
  employeeId: number;
  employee: Employee;
  requests: BankDetailChangeRequest[];
  loadingRequests: boolean;
}) {
  const [revealedAccount, setRevealedAccount] = useState<string | null>(null);
  const qc = useQueryClient();
  const pending = requests.filter((r) => r.status === "PENDING");
  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      (await api.post(`/employees/bank-change-requests/${id}/${action}`, {})).data,
    onSuccess: () => {
      toast.success("Bank change request updated");
      qc.invalidateQueries({ queryKey: ["bank-change-requests", employeeId] });
      qc.invalidateQueries({ queryKey: ["employee", employeeId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <>
      <Field label="Bank" value={employee.profile?.bank_name ?? "—"} />
      <div>
        <Field
          label="Account #"
          value={revealedAccount ?? employee.profile?.bank_account_no ?? "—"}
          mono
        />
        {revealedAccount ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-2 text-xs"
            onClick={() => setRevealedAccount(null)}
          >
            <EyeOff className="h-3.5 w-3.5" /> Hide
          </Button>
        ) : employee.profile?.bank_account_no ? (
          <RevealBankAccountDialog employeeId={employeeId} onReveal={setRevealedAccount} />
        ) : null}
      </div>
      <Field label="IFSC" value={employee.profile?.bank_ifsc ?? "—"} mono />
      {employee.profile?.pending_bank_detail_change ? (
        <div className="sm:col-span-2">
          <Badge variant="warning">Pending change</Badge>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        {loadingRequests ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : pending.length === 0 ? null : (
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            {pending.map((r) => (
              <div
                key={r.id}
                className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-3">
                  {r.changes.includes("bank_name") ? <Field label="Bank" value={r.bank_name ?? "—"} /> : null}
                  {r.changes.includes("bank_account_no") ? (
                    <Field label="Account #" value={r.bank_account_no ?? "—"} mono />
                  ) : null}
                  {r.changes.includes("bank_ifsc") ? <Field label="IFSC" value={r.bank_ifsc ?? "—"} mono /> : null}
                </div>
                <div className="flex items-center gap-2">
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
                    loading={decide.isPending && decide.variables?.id === r.id && decide.variables?.action === "reject"}
                    onClick={() => decide.mutate({ id: r.id, action: "reject" })}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function RevealBankAccountDialog({
  employeeId,
  onReveal,
}: {
  employeeId: number;
  onReveal: (accountNo: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const reveal = useMutation({
    mutationFn: async () => {
      const step = await api.post<StepUpToken>("/auth/step-up", {
        password,
        purpose: "BANK_ACCOUNT_REVEAL",
      });
      const res = await api.post<BankAccountReveal>(
        `/employees/${employeeId}/bank-account/reveal`,
        {},
        { headers: { "X-Step-Up-Token": step.data.access_token } },
      );
      return res.data;
    },
    onSuccess: (data) => {
      onReveal(data.bank_account_no ?? null);
      setPassword("");
      setOpen(false);
      toast.success("Account number revealed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs">
          <Eye className="h-3.5 w-3.5" /> Reveal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reveal account number</DialogTitle>
          <DialogDescription>Confirm your password to continue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="step-up-password">Password</Label>
          <Input
            id="step-up-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!password} loading={reveal.isPending} onClick={() => reveal.mutate()}>
            <KeyRound className="h-4 w-4" /> Reveal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalaryDialog({ employeeId, latest }: { employeeId: number; latest?: SalaryStructure }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const form = useForm<SalaryValues>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      effective_from: format(new Date(), "yyyy-MM-dd"),
      // Pre-fill from the most recent version if one exists; otherwise blank.
      ctc_annual: latest?.ctc_annual ?? 0,
      basic_monthly: latest?.basic_monthly ?? 0,
      components: latest?.components ?? [],
    },
  });

  const components = form.watch("components");

  function addComponent() {
    form.setValue("components", [
      ...components,
      { code: "", name: "", type: "EARNING", calc: "FIXED", value: 0 },
    ]);
  }
  function removeComponent(i: number) {
    form.setValue("components", components.filter((_, idx) => idx !== i));
  }

  const submit = useMutation({
    mutationFn: async (v: SalaryValues) =>
      (await api.post("/salary-structures", { ...v, employee_id: employeeId })).data,
    onSuccess: () => {
      toast.success("Salary structure saved");
      qc.invalidateQueries({ queryKey: ["salary-structures", employeeId] });
      setOpen(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Wallet className="h-4 w-4" /> New version
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New salary structure</DialogTitle>
          <DialogDescription>Creates a new versioned structure and deactivates the previous one.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => submit.mutate(v))}>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Effective from</Label>
              <Input type="date" {...form.register("effective_from")} />
            </div>
            <div className="space-y-1.5">
              <Label>CTC (annual)</Label>
              <Input type="number" step="0.01" {...form.register("ctc_annual")} />
            </div>
            <div className="space-y-1.5">
              <Label>Basic (monthly)</Label>
              <Input type="number" step="0.01" {...form.register("basic_monthly")} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Components</Label>
              <Button type="button" size="sm" variant="outline" onClick={addComponent}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {components.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No components added. Click “Add” to define earnings and deductions.
              </p>
            ) : (
              <div className="space-y-2">
                {components.map((_c, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <Input className="col-span-2" placeholder="Code" {...form.register(`components.${i}.code`)} />
                    <Input className="col-span-3" placeholder="Name" {...form.register(`components.${i}.name`)} />
                    <Select
                      value={form.watch(`components.${i}.type`)}
                      onValueChange={(v) => form.setValue(`components.${i}.type`, v as SalaryValues["components"][number]["type"])}
                    >
                      <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EARNING">Earning</SelectItem>
                        <SelectItem value="DEDUCTION">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={form.watch(`components.${i}.calc`)}
                      onValueChange={(v) => form.setValue(`components.${i}.calc`, v as SalaryValues["components"][number]["calc"])}
                    >
                      <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed</SelectItem>
                        <SelectItem value="PERCENT_OF_BASIC">% of Basic</SelectItem>
                        <SelectItem value="PERCENT_OF_CTC">% of CTC</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="col-span-1 tabular-nums"
                      type="number"
                      step="0.01"
                      {...form.register(`components.${i}.value`)}
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeComponent(i)} className="col-span-1">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submit.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const applyTemplateSchema = z.object({
  template_id: z.coerce.number().int().positive("Pick a template"),
  effective_from: z.string().min(1, "Required"),
  ctc_annual: z.coerce.number().min(0).optional(),
});
type ApplyTemplateValues = z.infer<typeof applyTemplateSchema>;

function ApplyTemplateDialog({ employeeId }: { employeeId: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const templates = useQuery({
    queryKey: ["settings", "salary-templates"],
    queryFn: async () =>
      (await api.get<SalaryTemplate[]>("/settings/salary-templates")).data,
    enabled: open,
  });
  const activeTemplates = (templates.data ?? []).filter((t) => t.is_active);

  const form = useForm<ApplyTemplateValues>({
    resolver: zodResolver(applyTemplateSchema),
    defaultValues: {
      template_id: 0,
      effective_from: format(new Date(), "yyyy-MM-dd"),
      ctc_annual: undefined,
    },
  });

  const selectedId = Number(form.watch("template_id") || 0);
  const selected = activeTemplates.find((t) => t.id === selectedId);

  // Pre-fill the CTC override field with the template's CTC whenever the user
  // picks a different template, so the displayed amount tracks the source.
  // The field stays editable for per-employee overrides.
  useEffect(() => {
    if (selected) {
      form.setValue("ctc_annual", selected.annual_ctc ?? 0);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useMutation({
    mutationFn: async (v: ApplyTemplateValues) =>
      (
        await api.post("/salary-structures/apply-template", {
          employee_id: employeeId,
          template_id: v.template_id,
          effective_from: v.effective_from,
          // Treat 0 / unset as "use the template's CTC" — sending 0 would fail
          // the backend's "CTC must be > 0" guard.
          ctc_annual: v.ctc_annual && v.ctc_annual > 0 ? v.ctc_annual : undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success("Template applied");
      qc.invalidateQueries({ queryKey: ["salary-structures", employeeId] });
      setOpen(false);
      form.reset({
        template_id: 0,
        effective_from: format(new Date(), "yyyy-MM-dd"),
        ctc_annual: undefined,
      });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LayoutTemplate className="h-4 w-4" /> Apply template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply salary template</DialogTitle>
          <DialogDescription>
            Materialise a reusable template into a versioned structure. The currently
            active structure (if any) becomes inactive on the effective date.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => submit.mutate(v))}>
          <div className="space-y-1.5">
            <Label>Template</Label>
            {templates.isLoading ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : activeTemplates.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
                No active salary templates yet. Create one in{" "}
                <Link to="/settings/salary-templates" className="font-medium underline">
                  Settings → Salary templates
                </Link>{" "}
                first.
              </div>
            ) : (
              <Select
                value={selectedId ? String(selectedId) : ""}
                onValueChange={(v) =>
                  form.setValue("template_id", Number(v), { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a template" />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                      {t.annual_ctc ? ` · ${formatCurrency(t.annual_ctc)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {form.formState.errors.template_id ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.template_id.message}
              </p>
            ) : null}
          </div>

          {selected ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{selected.name}</span>
                <span className="tabular-nums">
                  {(selected.components ?? []).length} component(s)
                </span>
              </div>
              {selected.description ? (
                <p className="mt-1 line-clamp-2">{selected.description}</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="effective_from">Effective from</Label>
              <Input
                id="effective_from"
                type="date"
                {...form.register("effective_from")}
              />
              {form.formState.errors.effective_from ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.effective_from.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ctc_annual">CTC override (optional)</Label>
              <Input
                id="ctc_annual"
                type="number"
                step="0.01"
                placeholder={selected?.annual_ctc ? String(selected.annual_ctc) : "—"}
                {...form.register("ctc_annual")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submit.isPending}
              disabled={activeTemplates.length === 0}
            >
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
