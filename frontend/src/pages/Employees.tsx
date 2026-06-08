import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Download, FileUp, Search, Upload, UserPlus, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/user-avatar";
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
import { cn } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { Employee, Page } from "@/types/api";

function buildCreateSchema(allowedDomains: readonly string[] | undefined) {
  return z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    work_email: z
      .string()
      .email()
      .refine((v) => isEmailDomainAllowed(v, allowedDomains), {
        message: workEmailErrorMessage(allowedDomains),
      }),
    date_of_joining: z.string().min(1),
    department: z.string().optional(),
    designation: z.string().optional(),
    employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  });
}
type CreateValues = z.infer<ReturnType<typeof buildCreateSchema>>;

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

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const policy = useAuthPolicy();
  const allowedDomains = policy.data?.allowed_email_domains;
  const emailHint = workEmailHint(allowedDomains);
  const createSchema = useMemo(() => buildCreateSchema(allowedDomains), [allowedDomains]);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      work_email: "",
      date_of_joining: format(new Date(), "yyyy-MM-dd"),
      department: "",
      designation: "",
      employment_type: "FULL_TIME",
    },
  });

  const create = useMutation({
    mutationFn: async (v: CreateValues) => {
      const payload = { ...v, create_user: true, role: "EMPLOYEE" as const };
      return (await api.post("/employees", payload)).data;
    },
    onSuccess: () => {
      toast.success("Employee created");
      qc.invalidateQueries({ queryKey: ["employees"] });
      setOpen(false);
      form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          Add employee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>Creates a profile and a login account.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <div className="space-y-1.5">
            <Label>First name</Label>
            <Input {...form.register("first_name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Last name</Label>
            <Input {...form.register("last_name")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Work email</Label>
            <Input
              type="email"
              placeholder={
                allowedDomains && allowedDomains.length > 0
                  ? `name@${allowedDomains[0]}`
                  : "name@company.com"
              }
              {...form.register("work_email")}
            />
            {form.formState.errors.work_email ? (
              <p className="text-xs text-destructive">{form.formState.errors.work_email.message}</p>
            ) : emailHint ? (
              <p className="text-xs text-muted-foreground">{emailHint}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Date of joining</Label>
            <Input type="date" {...form.register("date_of_joining")} />
          </div>
          <div className="space-y-1.5">
            <Label>Employment type</Label>
            <Select value={form.watch("employment_type")} onValueChange={(v) => form.setValue("employment_type", v as CreateValues["employment_type"])}>
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
            <Label>Department</Label>
            <Input {...form.register("department")} />
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input {...form.register("designation")} />
          </div>
          <div className={cn(
            "sm:col-span-2 rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground",
          )}>
            A secure temporary password will be generated automatically and emailed to the work
            address along with sign-in instructions. The employee can change it any time from
            their profile.
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
