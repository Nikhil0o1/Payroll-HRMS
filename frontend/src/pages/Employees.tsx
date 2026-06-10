import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FileUp,
  Paperclip,
  Search,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/user-avatar";
import { SalaryPreviewCard, useSalaryPreview } from "@/components/salary-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { PageHeader } from "@/components/ui/page-header";
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
import { EmployeeStatusBadge } from "@/components/status-badge";
import { api, apiErrorMessage } from "@/lib/api";
import {
  isEmailDomainAllowed,
  useAuthPolicy,
  workEmailErrorMessage,
  workEmailHint,
} from "@/lib/auth-policy";
import { cn, formatCurrency } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { DocumentExtractionOut, Employee, Page } from "@/types/api";

function buildCreateSchema(allowedDomains: readonly string[] | undefined) {
  return z.object({
    // Step 1 — basic details
    first_name: z.string().min(1, "Required"),
    last_name: z.string().min(1, "Required"),
    work_email: z
      .string()
      .email()
      .refine((v) => isEmailDomainAllowed(v, allowedDomains), {
        message: workEmailErrorMessage(allowedDomains),
      }),
    personal_email: z.string().email("Enter a valid email").optional().or(z.literal("")),
    phone: z.string().max(32).optional().or(z.literal("")),
    date_of_birth: z.string().optional().or(z.literal("")),
    certificate_date_of_birth: z.string().optional().or(z.literal("")),
    gender: z.string().optional().or(z.literal("")),
    address: z.string().max(300).optional().or(z.literal("")),
    date_of_joining: z.string().min(1, "Required"),
    department: z.string().optional().or(z.literal("")),
    designation: z.string().optional().or(z.literal("")),
    employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
    // Step 1 — bank & tax
    pan: z.string().max(10).optional().or(z.literal("")),
    bank_account_holder_name: z.string().max(120).optional().or(z.literal("")),
    bank_account_no: z.string().max(34).optional().or(z.literal("")),
    bank_ifsc: z.string().max(20).optional().or(z.literal("")),
    bank_name: z.string().max(100).optional().or(z.literal("")),
    bank_branch: z.string().max(120).optional().or(z.literal("")),
    bank_account_type: z.string().optional().or(z.literal("")),
    // Step 2 — salary. Entered in ₹ lakhs (LPA); converted to annual rupees.
    ctc_annual: z.coerce.number().min(1, "Enter the annual CTC"),
  });
}
type CreateValues = z.infer<ReturnType<typeof buildCreateSchema>>;

const DOC_FIELDS: Array<{ type: string; label: string; experienced?: boolean }> = [
  { type: "AADHAAR", label: "Aadhaar card" },
  { type: "PAN", label: "PAN card" },
  { type: "MARKSHEET_10", label: "10th marksheet" },
  { type: "MARKSHEET_12", label: "12th marksheet" },
  { type: "DEGREE", label: "Degree / provisional certificate" },
  { type: "EXPERIENCE_LETTER", label: "Experience letter", experienced: true },
  { type: "PREVIOUS_PAYSLIP", label: "Previous salary slip", experienced: true },
];

const EMPLOYMENT_LABELS: Record<Employee["employment_type"], string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export function EmployeesPage() {
  const me = useAuthStore((s) => s.me);
  const canCreate = rolesAtLeast(me?.role, "HR_ADMIN");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [department, setDepartment] = useState<string>("");

  const q = useQuery({
    queryKey: ["employees", { search, page, status, department }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, size: 20 };
      if (search) params.q = search;
      if (status !== "ALL") params.status = status;
      if (department) params.department = department;
      return (await api.get<Page<Employee>>("/employees", { params })).data;
    },
  });

  const items = q.data?.items ?? [];
  const hasFilters = Boolean(search) || status !== "ALL" || Boolean(department);

  return (
    <>
      <PageHeader
        icon={Users}
        eyebrow="People"
        title="Employees"
        description="Directory of all team members and their employment details."
        actions={
          canCreate ? (
            <div className="flex items-center gap-2">
              <BulkImportDialog />
              <CreateDialog />
            </div>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <UsersRound className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {q.isLoading ? "—" : <span className="tabular-nums">{q.data?.total ?? 0}</span>}
            </span>
            <span className="text-muted-foreground">
              {q.data?.total === 1 ? "employee" : "employees"}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, code or email…"
                className="w-full pl-9 sm:w-[260px]"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as "ALL" | "ACTIVE" | "INACTIVE");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="p-0">
          {q.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={UsersRound}
                title={hasFilters ? "No matching employees" : "No employees yet"}
                description={
                  hasFilters
                    ? "Try adjusting your search or filters to find who you're looking for."
                    : "Once you add team members they'll appear here."
                }
                action={canCreate && !hasFilters ? <CreateDialog /> : null}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id} className="group">
                    <TableCell>
                      <Link
                        to={`/employees/${e.id}`}
                        className="flex items-center gap-3"
                      >
                        <UserAvatar
                          name={`${e.first_name} ${e.last_name}`}
                          src={e.photo_url}
                          className="h-9 w-9 shrink-0 ring-1 ring-border"
                          fallbackClassName="bg-primary/10 text-xs font-medium text-primary"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground group-hover:text-primary">
                            {e.first_name} {e.last_name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{e.work_email}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {e.employee_code}
                    </TableCell>
                    <TableCell>{e.department ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">
                      {e.designation ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {EMPLOYMENT_LABELS[e.employment_type]}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      {format(parseISO(e.date_of_joining), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <EmployeeStatusBadge status={e.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {q.data && q.data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Page <span className="tabular-nums font-medium text-foreground">{q.data.page}</span> of{" "}
              <span className="tabular-nums">{q.data.pages}</span>
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= q.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-3.5 w-20 sm:block" />
          <Skeleton className="hidden h-3.5 w-24 sm:block" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

const ONBOARD_STEPS = [
  { label: "Basic details", hint: "Personal & job details." },
  { label: "Bank details", hint: "Bank account & tax details for salary payouts." },
  { label: "Salary", hint: "Salary structure from the employment type + CTC." },
  { label: "Documents", hint: "Upload ID & certificates (optional)." },
] as const;
const LAST_STEP = ONBOARD_STEPS.length; // 4

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [experienced, setExperienced] = useState(false);
  const [docs, setDocs] = useState<Record<string, File | null>>({});
  const qc = useQueryClient();
  const policy = useAuthPolicy();
  const allowedDomains = policy.data?.allowed_email_domains;
  const emailHint = workEmailHint(allowedDomains);
  const createSchema = useMemo(() => buildCreateSchema(allowedDomains), [allowedDomains]);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    mode: "onTouched",
    defaultValues: {
      first_name: "",
      last_name: "",
      work_email: "",
      personal_email: "",
      phone: "",
      date_of_birth: "",
      certificate_date_of_birth: "",
      gender: "",
      address: "",
      date_of_joining: format(new Date(), "yyyy-MM-dd"),
      department: "",
      designation: "",
      employment_type: "FULL_TIME",
      pan: "",
      bank_account_holder_name: "",
      bank_account_no: "",
      bank_ifsc: "",
      bank_name: "",
      bank_branch: "",
      bank_account_type: "",
      ctc_annual: 0,
    },
  });

  const employmentType = form.watch("employment_type");
  const ctc = Number(form.watch("ctc_annual")) || 0;
  const preview = useSalaryPreview(employmentType, ctc, open && step >= 2);

  function reset() {
    form.reset();
    setStep(1);
    setDocs({});
    setExperienced(false);
  }

  const onboard = useMutation({
    mutationFn: async (v: CreateValues) => {
      // 1) Create the employee + profile (bank/tax/demographics set directly) +
      //    login account — this also sends the welcome/onboarding email.
      const emp = (
        await api.post<Employee>("/employees", {
          first_name: v.first_name,
          last_name: v.last_name,
          work_email: v.work_email,
          personal_email: v.personal_email?.trim() || undefined,
          phone: v.phone?.trim() || undefined,
          date_of_joining: v.date_of_joining,
          department: v.department?.trim() || undefined,
          designation: v.designation?.trim() || undefined,
          employment_type: v.employment_type,
          date_of_birth: v.date_of_birth || undefined,
          certificate_date_of_birth: v.certificate_date_of_birth || undefined,
          gender: v.gender?.trim() || undefined,
          address: v.address?.trim() || undefined,
          pan: v.pan?.trim() || undefined,
          bank_account_holder_name: v.bank_account_holder_name?.trim() || undefined,
          bank_account_no: v.bank_account_no?.trim() || undefined,
          bank_ifsc: v.bank_ifsc?.trim() || undefined,
          bank_name: v.bank_name?.trim() || undefined,
          bank_branch: v.bank_branch?.trim() || undefined,
          bank_account_type: v.bank_account_type || undefined,
          create_user: true,
          role: "EMPLOYEE",
        })
      ).data;
      // 2) Salary structure built from the employment type's components + CTC.
      await api.post("/salary-structures/from-type", {
        employee_id: emp.id,
        employment_type: v.employment_type,
        ctc_annual: v.ctc_annual,
        effective_from: v.date_of_joining,
      });
      // 3) Documents (sequential; each is its own multipart upload).
      for (const [docType, file] of Object.entries(docs)) {
        if (!file) continue;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("doc_type", docType);
        await api.post(`/employees/${emp.id}/documents`, fd);
      }
      return emp;
    },
    onSuccess: () => {
      toast.success("Employee onboarded — invite email sent");
      qc.invalidateQueries({ queryKey: ["employees"] });
      setOpen(false);
      reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // OCR auto-fill: read identity fields off a PAN/Aadhaar image and pre-fill the
  // basic-details form. Best-effort — only fills blank fields, never overwrites.
  const [extracting, setExtracting] = useState<string | null>(null);
  async function extractFromDoc(docType: string, file: File) {
    if (docType !== "PAN" && docType !== "AADHAAR") return;
    setExtracting(docType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType);
      const res = (await api.post<DocumentExtractionOut>("/employees/extract-document", fd)).data;
      if (!res.engine_available) {
        toast.message("Document OCR isn't enabled on the server — fill the details manually.");
        return;
      }
      const f = res.fields ?? {};
      const setIfEmpty = (name: keyof CreateValues, value?: string | null) => {
        if (!value) return false;
        const cur = String(form.getValues(name) ?? "").trim();
        if (cur) return false;
        form.setValue(name, value as never, { shouldValidate: true, shouldDirty: true });
        return true;
      };
      let filled = 0;
      filled += setIfEmpty("first_name", f.first_name) ? 1 : 0;
      filled += setIfEmpty("last_name", f.last_name) ? 1 : 0;
      filled += setIfEmpty("date_of_birth", f.date_of_birth) ? 1 : 0;
      filled += setIfEmpty("gender", f.gender) ? 1 : 0;
      filled += setIfEmpty("address", f.address) ? 1 : 0;
      if (docType === "PAN") filled += setIfEmpty("pan", f.pan) ? 1 : 0;
      toast[filled ? "success" : "message"](
        filled
          ? `Auto-filled ${filled} field${filled > 1 ? "s" : ""} from ${docType === "PAN" ? "PAN" : "Aadhaar"}`
          : "Couldn't read clear details from that image — please check manually.",
      );
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setExtracting(null);
    }
  }

  async function next() {
    if (step === 1) {
      const ok = await form.trigger([
        "first_name",
        "last_name",
        "work_email",
        "personal_email",
        "phone",
        "date_of_birth",
        "certificate_date_of_birth",
        "date_of_joining",
      ]);
      if (ok) setStep(2);
    } else if (step === 2) {
      // Bank details are all optional — nothing to gate on.
      setStep(3);
    } else if (step === 3) {
      const ok = await form.trigger(["ctc_annual"]);
      if (ok) setStep(4);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          Add employee
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="shrink-0 space-y-4 border-b border-border px-6 pb-4 pt-6">
          <DialogHeader>
            <DialogTitle>Onboard employee</DialogTitle>
            <DialogDescription>
              {ONBOARD_STEPS[step - 1].hint} A login invite is emailed on completion.
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-2">
          {ONBOARD_STEPS.map((s, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <div key={s.label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                    done
                      ? "bg-success text-white"
                      : active
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                <span className={cn("hidden text-xs font-medium sm:inline", active ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
                {i < ONBOARD_STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
              </div>
            );
          })}
          </div>
        </div>

        {/* Onboarding fires only from the explicit "Onboard employee" button
            (below) — the form never submits, so a stray Enter / file-dialog
            interaction can never create the employee. */}
        <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-[300px] flex-1 overflow-y-auto px-6 py-5">
            {/* Step 1 — basic details */}
          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" required error={form.formState.errors.first_name?.message}>
                <Input {...form.register("first_name")} />
              </Field>
              <Field label="Last name" required error={form.formState.errors.last_name?.message}>
                <Input {...form.register("last_name")} />
              </Field>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  Work email<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder={allowedDomains?.length ? `name@${allowedDomains[0]}` : "name@company.com"}
                  {...form.register("work_email")}
                />
                {form.formState.errors.work_email ? (
                  <p className="text-xs text-destructive">{form.formState.errors.work_email.message}</p>
                ) : emailHint ? (
                  <p className="text-xs text-muted-foreground">{emailHint}</p>
                ) : null}
              </div>
              <Field label="Personal email" error={form.formState.errors.personal_email?.message}>
                <Input type="email" placeholder="optional" {...form.register("personal_email")} />
              </Field>
              <Field label="Phone">
                <Input placeholder="optional" {...form.register("phone")} />
              </Field>
              <Field label="Date of birth">
                <Input type="date" {...form.register("date_of_birth")} />
              </Field>
              <Field label="Certificate date of birth">
                <Input type="date" {...form.register("certificate_date_of_birth")} />
              </Field>
              <Field label="Gender">
                <Input placeholder="optional" {...form.register("gender")} />
              </Field>
              <Field label="Date of joining" required error={form.formState.errors.date_of_joining?.message}>
                <Input type="date" {...form.register("date_of_joining")} />
              </Field>
              <Field label="Employment type" required>
                <Select
                  value={form.watch("employment_type")}
                  onValueChange={(v) => form.setValue("employment_type", v as CreateValues["employment_type"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full-time</SelectItem>
                    <SelectItem value="PART_TIME">Part-time</SelectItem>
                    <SelectItem value="CONTRACT">Contract</SelectItem>
                    <SelectItem value="INTERN">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Department">
                <Input {...form.register("department")} />
              </Field>
              <Field label="Designation">
                <Input {...form.register("designation")} />
              </Field>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Input placeholder="optional — auto-filled from Aadhaar" {...form.register("address")} />
              </div>
            </div>
          ) : null}

          {/* Step 2 — bank & tax details */}
          {step === 2 ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Bank account &amp; tax IDs used for salary payouts. All optional — you can add or
                change these later from the employee's profile.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="PAN">
                  <Input placeholder="ABCDE1234F" className="uppercase" {...form.register("pan")} />
                </Field>
                <Field label="Account holder name">
                  <Input placeholder="As per bank records" {...form.register("bank_account_holder_name")} />
                </Field>
                <Field label="Bank account number">
                  <Input inputMode="numeric" placeholder="optional" {...form.register("bank_account_no")} />
                </Field>
                <Field label="Account type">
                  <Select
                    value={form.watch("bank_account_type") || ""}
                    onValueChange={(v) => form.setValue("bank_account_type", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAVINGS">Savings</SelectItem>
                      <SelectItem value="CURRENT">Current</SelectItem>
                      <SelectItem value="SALARY">Salary</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Bank name">
                  <Input placeholder="optional" {...form.register("bank_name")} />
                </Field>
                <Field label="Branch">
                  <Input placeholder="optional" {...form.register("bank_branch")} />
                </Field>
                <Field label="IFSC code">
                  <Input placeholder="optional" className="uppercase" {...form.register("bank_ifsc")} />
                </Field>
              </div>
            </div>
          ) : null}

          {/* Step 3 — salary (employment type auto-detected from step 1) */}
          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Employment type">
                  <div className="flex h-9 items-center justify-between rounded-md border border-input bg-muted/40 px-3 text-sm">
                    <span className="font-medium">{EMPLOYMENT_LABELS[employmentType]}</span>
                    <span className="text-[11px] text-muted-foreground">from Basic details</span>
                  </div>
                </Field>
                <Field label="Annual CTC (in ₹ lakhs)" required error={form.formState.errors.ctc_annual?.message}>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      placeholder="e.g. 5"
                      className="pr-12"
                      value={ctc ? ctc / 100000 : ""}
                      onChange={(e) => {
                        const lpa = parseFloat(e.target.value);
                        form.setValue("ctc_annual", isNaN(lpa) ? 0 : Math.round(lpa * 100000), {
                          shouldValidate: true,
                        });
                      }}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
                      LPA
                    </span>
                  </div>
                  {ctc > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      = {formatCurrency(ctc)} / year · {formatCurrency(Math.round(ctc / 12))} / month
                    </p>
                  ) : null}
                </Field>
              </div>
              {ctc > 0 ? (
                <SalaryPreviewCard preview={preview.data} loading={preview.isLoading} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enter an Annual CTC to preview the salary structure (built from{" "}
                  {EMPLOYMENT_LABELS[employmentType]} components).
                </p>
              )}
            </div>
          ) : null}

          {/* Step 4 — documents */}
          {step === 4 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload the employee's documents (optional — add more later). Aadhaar &amp; PAN are
                scanned to auto-fill the basic details; review them on step&nbsp;1.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                  checked={experienced}
                  onChange={(e) => setExperienced(e.target.checked)}
                />
                Experienced hire (show previous payslip &amp; experience letter)
              </label>
              <div className="space-y-2">
                {DOC_FIELDS.filter((d) => !d.experienced || experienced).map((d) => (
                  <DocRow
                    key={d.type}
                    label={d.label}
                    canExtract={d.type === "PAN" || d.type === "AADHAAR"}
                    busy={extracting === d.type}
                    file={docs[d.type] ?? null}
                    onSet={(f) => {
                      setDocs((cur) => ({ ...cur, [d.type]: f }));
                      if (f) void extractFromDoc(d.type, f);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-card px-6 py-3.5">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            )}
            {step < LAST_STEP ? (
              <Button type="button" onClick={next}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                loading={onboard.isPending}
                onClick={() => form.handleSubmit((v) => onboard.mutate(v))()}
              >
                <Check className="h-4 w-4" /> Onboard employee
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function DocRow({
  label,
  file,
  onSet,
  canExtract,
  busy,
}: {
  label: string;
  file: File | null;
  onSet: (f: File | null) => void;
  canExtract?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="inline-flex min-w-0 items-center gap-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        {canExtract ? (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline-flex">
            <Sparkles className="h-3 w-3" /> auto-fill
          </span>
        ) : null}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <input
          ref={ref}
          type="file"
          accept=".pdf,image/*"
          className="sr-only"
          onChange={(e) => {
            onSet(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Reading…
          </span>
        ) : null}
        {file ? (
          <>
            <span className="max-w-[160px] truncate text-xs text-success">{file.name}</span>
            <button
              type="button"
              onClick={() => onSet(null)}
              aria-label="Remove"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}>
            <Paperclip className="h-4 w-4" /> Upload
          </Button>
        )}
      </div>
    </div>
  );
}

type ImportResult = {
  total: number;
  created: number;
  failed: { row: number; email: string; error: string }[];
};

function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sendInvites, setSendInvites] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const qc = useQueryClient();

  function reset() {
    setFile(null);
    setResult(null);
    setSendInvites(false);
  }

  async function downloadTemplate() {
    try {
      const r = await api.get("/employees/import/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a CSV file first.");
      const fd = new FormData();
      fd.append("file", file);
      return (
        await api.post("/employees/import", fd, {
          params: { send_invites: sendInvites },
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["employees"] });
      if (data.created > 0)
        toast.success(`Imported ${data.created} employee${data.created === 1 ? "" : "s"}`);
      if (data.failed.length > 0)
        toast.error(`${data.failed.length} row${data.failed.length === 1 ? "" : "s"} couldn't be imported`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import employees</DialogTitle>
          <DialogDescription>
            Add many employees at once from a CSV. Rows with an{" "}
            <span className="font-mono text-foreground">annual_ctc</span> get a salary structure
            (Basic / HRA / PF / PT…) created automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Download className="h-4 w-4" /> Download CSV template
          </button>

          <div className="rounded-lg border border-dashed border-input bg-muted/30 p-5 text-center">
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
            <Label htmlFor="csv-file" className="block cursor-pointer">
              <FileUp className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {file ? file.name : "Choose a CSV file"}
              </span>
              <p className="mt-1 text-[11px] text-muted-foreground">
                first_name, last_name, work_email, department, designation, date_of_joining,
                employment_type, annual_ctc
              </p>
            </Label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={sendInvites}
              onChange={(e) => setSendInvites(e.target.checked)}
            />
            Create login accounts &amp; email an invite to each employee
          </label>

          {result ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium text-success">{result.created} imported successfully</div>
              {result.failed.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <div className="font-medium text-destructive">{result.failed.length} skipped</div>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {result.failed.map((f) => (
                      <li key={`${f.row}-${f.email}`}>
                        Row {f.row} ({f.email || "—"}): {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={() => upload.mutate()} loading={upload.isPending} disabled={!file}>
            <Upload className="h-4 w-4" /> Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
