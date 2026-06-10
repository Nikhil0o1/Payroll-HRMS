import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Plus, ShieldCheck, UserCog } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, apiErrorMessage } from "@/lib/api";
import {
  isEmailDomainAllowed,
  useAuthPolicy,
  workEmailErrorMessage,
  workEmailHint,
} from "@/lib/auth-policy";
import { initials } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { Role, RoleRow, UserListItem } from "@/types/api";

const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Employee",
  ADMIN: "Admin",
  // legacy aliases (any stored value resolves to these labels)
  MANAGER: "Admin",
  HR_ADMIN: "Admin",
  SUPER_ADMIN: "Admin",
};

export default function UsersRoles() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  return (
    <div>
      <div className="mb-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Settings
        </span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Users &amp; Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite people to the payroll workspace and review the role hierarchy.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "users" | "roles")}>
        <TabsList className="bg-transparent p-0 border-b border-border w-full justify-start rounded-none gap-1 h-auto">
          <TabsTrigger
            value="users"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 text-sm"
          >
            Users
          </TabsTrigger>
          <TabsTrigger
            value="roles"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 text-sm"
          >
            Roles
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-5">
        {tab === "users" ? <UsersTab /> : <RolesTab />}
      </div>
    </div>
  );
}

/* ───────────────────────── Users tab ───────────────────────── */

function UsersTab() {
  const me = useAuthStore((s) => s.me);
  const isSuper = rolesAtLeast(me?.role, "SUPER_ADMIN");
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<{ email: string; password: string } | null>(
    null,
  );

  const q = useQuery({
    queryKey: ["settings", "users"],
    queryFn: async () => (await api.get<UserListItem[]>("/settings/users")).data,
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      (
        await api.post(
          `/settings/users/${id}/${active ? "activate" : "deactivate"}`,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "users"] });
      toast.success("User updated");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const users = q.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <Button onClick={() => setInviting(true)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-[360px] rounded-xl" />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold [&>th]:text-left">
                <th>User Details</th>
                <th>Role</th>
                <th>Status</th>
                <th className="w-12 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {initials(u.employee_name || u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {u.employee_name ?? u.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.is_active
                          ? "inline-flex items-center gap-1.5 text-xs font-semibold text-success"
                          : "inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      <span
                        className={
                          u.is_active
                            ? "h-1.5 w-1.5 rounded-full bg-success"
                            : "h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                        }
                      />
                      {u.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isSuper && u.id !== me?.id ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="More"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {u.is_active ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                setActive.mutate({ id: u.id, active: false })
                              }
                              className="text-destructive"
                            >
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => setActive.mutate({ id: u.id, active: true })}
                            >
                              Activate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onIssued={(p) => {
          setIssuedPassword(p);
          setInviting(false);
        }}
      />
      <IssuedPasswordDialog
        data={issuedPassword}
        onClose={() => setIssuedPassword(null)}
      />
    </div>
  );
}

function buildInviteSchema(allowedDomains: readonly string[] | undefined) {
  return z.object({
    email: z
      .string()
      .email("Enter a valid email")
      .refine((v) => isEmailDomainAllowed(v, allowedDomains), {
        message: workEmailErrorMessage(allowedDomains),
      }),
    role: z.enum(["EMPLOYEE", "ADMIN"]),
  });
}
type InviteValues = z.infer<ReturnType<typeof buildInviteSchema>>;

function InviteDialog({
  open,
  onClose,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  onIssued: (p: { email: string; password: string }) => void;
}) {
  const qc = useQueryClient();
  const policy = useAuthPolicy();
  const allowedDomains = policy.data?.allowed_email_domains;
  const emailHint = workEmailHint(allowedDomains);
  const inviteSchema = useMemo(() => buildInviteSchema(allowedDomains), [allowedDomains]);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "EMPLOYEE" },
  });

  const submit = useMutation({
    mutationFn: async (v: InviteValues) =>
      (
        await api.post<{ id: number; email: string; role: Role; initial_password: string }>(
          "/settings/users/invite",
          v,
        )
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["settings", "users"] });
      toast.success("User invited");
      onIssued({ email: data.email, password: data.initial_password });
      form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a new user</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => submit.mutate(v))}
          className="space-y-4"
        >
          <div>
            <Label className="mb-1.5 block text-sm">
              Work email<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              type="email"
              {...form.register("email")}
              placeholder={
                allowedDomains && allowedDomains.length > 0
                  ? `name@${allowedDomains[0]}`
                  : "name@company.com"
              }
            />
            {form.formState.errors.email ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : emailHint ? (
              <p className="mt-1 text-xs text-muted-foreground">{emailHint}</p>
            ) : null}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Role</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(v) => form.setValue("role", v as "EMPLOYEE" | "ADMIN")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Admins manage everything (employees, payroll, settings). Employees self-serve.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submit.isPending}>
              Invite User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IssuedPasswordDialog({
  data,
  onClose,
}: {
  data: { email: string; password: string } | null;
  onClose: () => void;
}) {
  const open = !!data;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User invited</DialogTitle>
        </DialogHeader>
        {data ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share these credentials with <strong>{data.email}</strong> over a secure channel.
              They'll be prompted to change the password on first login. This is the only time we
              show the temporary password.
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm flex items-center justify-between gap-3">
              <span className="break-all">{data.password}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(data.password);
                  toast.success("Copied to clipboard");
                }}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Copy password"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Roles tab ───────────────────────── */

function RolesTab() {
  const q = useQuery({
    queryKey: ["settings", "roles"],
    queryFn: async () => (await api.get<RoleRow[]>("/settings/roles")).data,
  });

  const ROLE_DETAILS: Partial<
    Record<Role, { description: string; capabilities: string[]; icon: typeof ShieldCheck }>
  > = {
    EMPLOYEE: {
      description: "Self-service access for everyday work.",
      capabilities: [
        "Punch in / out, view attendance",
        "Apply for leave and regularization",
        "View and download own payslips",
      ],
      icon: UserCog,
    },
    ADMIN: {
      description: "Full control of the workspace — the HR administrator.",
      capabilities: [
        "Manage employees, salary structures, leave types & holidays",
        "Create, review and lock payroll runs",
        "Approve leaves and attendance regularizations",
        "Manage users, roles, org profile and all settings",
      ],
      icon: ShieldCheck,
    },
  };

  const rows = q.data ?? [];

  return q.isLoading ? (
    <Skeleton className="h-[360px] rounded-xl" />
  ) : (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((r) => {
        const detail = ROLE_DETAILS[r.name];
        const Icon = detail?.icon ?? ShieldCheck;
        return (
          <article
            key={r.id}
            className="rounded-xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h3 className="font-semibold">{ROLE_LABEL[r.name]}</h3>
                <p className="text-xs text-muted-foreground">
                  {detail?.description ?? r.description}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              {(detail?.capabilities ?? []).map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  {c}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
