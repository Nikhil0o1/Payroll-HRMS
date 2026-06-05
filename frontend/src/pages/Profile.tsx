import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Mail, Save, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { initials } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { Employee } from "@/types/api";

const profileSchema = z.object({
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  bank_account_no: z.string().optional().nullable(),
  bank_ifsc: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
});
type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.new_password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });
type PasswordValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const me = useAuthStore((s) => s.me);
  const [params] = useSearchParams();
  const initialTab = params.get("tab") === "password" ? "password" : "profile";
  const empId = me?.employee?.id;

  const empQuery = useQuery({
    queryKey: ["employee", empId],
    queryFn: async () => (await api.get<Employee>(`/employees/${empId}`)).data,
    enabled: !!empId,
  });

  const fullName = me?.employee
    ? `${me.employee.first_name} ${me.employee.last_name}`
    : me?.email ?? "";
  const subtitle = [
    me?.employee?.designation ?? me?.role.replace("_", " "),
    me?.employee?.department,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title="My profile"
        description="Personal information, banking, and security."
        icon={UserCog}
      />

      <Card className="mb-6 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-sidebar to-primary" />
        <CardContent className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
          <Avatar className="h-20 w-20 border-4 border-card shadow-card">
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
              {initials(`${me?.employee?.first_name ?? me?.email ?? ""} ${me?.employee?.last_name ?? ""}`)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{fullName}</h2>
              {me?.role ? (
                <Badge variant="secondary">{me.role.replace("_", " ")}</Badge>
              ) : null}
            </div>
            {subtitle ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            {me?.email ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {me.email}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="profile">
            <UserCog className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password">
            <KeyRound className="h-4 w-4" />
            Password
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          {empQuery.data ? <ProfileForm employee={empQuery.data} /> : null}
        </TabsContent>
        <TabsContent value="password">
          <PasswordForm />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfileForm({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      date_of_birth: employee.profile?.date_of_birth ?? "",
      gender: employee.profile?.gender ?? "",
      address: employee.profile?.address ?? "",
      bank_account_no: employee.profile?.bank_account_no ?? "",
      bank_ifsc: employee.profile?.bank_ifsc ?? "",
      bank_name: employee.profile?.bank_name ?? "",
      pan: employee.profile?.pan ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: ProfileValues) =>
      (await api.put(`/employees/${employee.id}/profile`, v)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee", employee.id] });
      toast.success("Profile saved");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal & banking</CardTitle>
        <CardDescription>Used for payroll and statutory records.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <div className="space-y-1.5">
            <Label htmlFor="date_of_birth">Date of birth</Label>
            <Input id="date_of_birth" type="date" {...form.register("date_of_birth")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gender">Gender</Label>
            <Input id="gender" {...form.register("gender")} />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} {...form.register("address")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_name">Bank name</Label>
            <Input id="bank_name" {...form.register("bank_name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_account_no">Account number</Label>
            <Input id="bank_account_no" {...form.register("bank_account_no")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_ifsc">IFSC</Label>
            <Input id="bank_ifsc" {...form.register("bank_ifsc")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pan">PAN</Label>
            <Input id="pan" {...form.register("pan")} />
          </div>
          <div className="md:col-span-2 flex justify-end border-t pt-4">
            <Button type="submit" loading={save.isPending}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });
  const change = useMutation({
    mutationFn: async (v: PasswordValues) =>
      (await api.post("/auth/change-password", {
        current_password: v.current_password,
        new_password: v.new_password,
      })).data,
    onSuccess: () => {
      toast.success("Password changed. Please sign in again.");
      clear();
      navigate("/login", { replace: true });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Use a strong, unique password. You'll be signed out and asked to log back in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4 max-w-md" onSubmit={form.handleSubmit((v) => change.mutate(v))}>
          <div className="space-y-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" autoComplete="current-password" {...form.register("current_password")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" autoComplete="new-password" {...form.register("new_password")} />
            {form.formState.errors.new_password ? (
              <p className="text-xs text-destructive">{form.formState.errors.new_password.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf">Confirm new password</Label>
            <Input id="cf" type="password" autoComplete="new-password" {...form.register("confirm")} />
            {form.formState.errors.confirm ? (
              <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>
            ) : null}
          </div>
          <Button type="submit" loading={change.isPending}>
            <KeyRound className="h-4 w-4" />
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
