import { useState } from "react";
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
  CreditCard,
  Mail,
  Phone,
  Plus,
  Power,
  Save,
  ShieldCheck,
  User,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { cn, formatCurrency, initials } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { Employee, SalaryStructure } from "@/types/api";

const editSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
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

  return (
    <>
      <BackLink />

      {/* Profile header */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
          <Avatar className="h-16 w-16 shrink-0 ring-2 ring-primary/15">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials(`${emp.first_name} ${emp.last_name}`)}
            </AvatarFallback>
          </Avatar>

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
                <Field label="Bank" value={emp.profile?.bank_name ?? "—"} />
                <Field label="Account #" value={emp.profile?.bank_account_no ?? "—"} mono />
                <Field label="IFSC" value={emp.profile?.bank_ifsc ?? "—"} mono />
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
                <SalaryDialog employeeId={employeeId} latest={structures.data?.[0]} />
              </CardHeader>
              <CardContent className="pt-0">
                {(structures.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="No salary structure yet"
                    description="Create the first versioned structure to enable payroll for this employee."
                    action={<SalaryDialog employeeId={employeeId} latest={structures.data?.[0]} />}
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
