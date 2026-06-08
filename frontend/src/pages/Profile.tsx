import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, KeyRound, Loader2, Mail, Plus, Save, Trash2, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";

import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { EmergencyContact, Employee } from "@/types/api";

const profileSchema = z.object({
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  personal_email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().max(32).optional().nullable(),
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
        <div className="h-24 bg-gradient-to-r from-sidebar to-primary" />
        <div className="px-6 pb-5">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <div className="-mt-14 shrink-0 sm:-mt-12">
              {empQuery.data ? (
                <AvatarUploader employee={empQuery.data} />
              ) : (
                <UserAvatar
                  name={fullName}
                  src={me?.employee?.photo_url}
                  className="h-20 w-20 border-4 border-card shadow-card"
                  fallbackClassName="bg-primary/10 text-xl font-semibold text-primary"
                />
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pt-3">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{fullName}</h2>
                {me?.role ? (
                  <Badge variant="secondary">{me.role.replace("_", " ")}</Badge>
                ) : null}
              </div>
              {subtitle ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
              {me?.email ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {me.email}
                </p>
              ) : null}
            </div>
          </div>
        </div>
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
      personal_email: employee.personal_email ?? "",
      phone: employee.phone ?? "",
      address: employee.profile?.address ?? "",
      bank_account_no: "",
      bank_ifsc: employee.profile?.bank_ifsc ?? "",
      bank_name: employee.profile?.bank_name ?? "",
      pan: employee.profile?.pan ?? "",
    },
  });

  const [contacts, setContacts] = useState<EmergencyContact[]>(
    employee.profile?.emergency_contacts ?? [],
  );
  function updateContact(i: number, patch: Partial<EmergencyContact>) {
    setContacts((cur) => cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  const save = useMutation({
    mutationFn: async (v: Record<string, unknown>) =>
      (await api.put(`/employees/${employee.id}/profile`, v)).data,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["employee", employee.id] });
      const bankSubmitted = ["bank_account_no", "bank_ifsc", "bank_name"].some((k) => k in variables);
      toast.success(bankSubmitted ? "Bank change submitted for approval" : "Profile saved");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function submit(v: ProfileValues) {
    const dirty = form.formState.dirtyFields;
    const trimmedContacts = contacts
      .map((c) => ({
        name: (c.name ?? "").trim(),
        relationship: (c.relationship ?? "").trim(),
        phone: (c.phone ?? "").trim(),
      }))
      .filter((c) => c.name || c.phone || c.relationship);
    const payload: Record<string, unknown> = {
      date_of_birth: v.date_of_birth || null,
      gender: v.gender || null,
      personal_email: v.personal_email?.trim() ? v.personal_email.trim() : null,
      phone: v.phone?.trim() ? v.phone.trim() : null,
      address: v.address || null,
      pan: v.pan || null,
      emergency_contacts: trimmedContacts,
    };
    if (dirty.bank_name) payload.bank_name = v.bank_name;
    if (dirty.bank_ifsc) payload.bank_ifsc = v.bank_ifsc;
    if (dirty.bank_account_no) payload.bank_account_no = v.bank_account_no;
    save.mutate(payload);
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      {/* Personal details */}
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Your contact and demographic information.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input id="date_of_birth" type="date" {...form.register("date_of_birth")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <Input id="gender" placeholder="e.g. Female" {...form.register("gender")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personal_email">Personal email</Label>
              <Input id="personal_email" type="email" placeholder="you@example.com" {...form.register("personal_email")} />
              {form.formState.errors.personal_email ? (
                <p className="text-xs text-destructive">{form.formState.errors.personal_email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder="+91 98765 43210" {...form.register("phone")} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" rows={2} {...form.register("address")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency contacts */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Emergency contacts</CardTitle>
            <CardDescription>Who we should reach in an emergency.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setContacts((c) => [...c, { name: "", relationship: "", phone: "" }])}
          >
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No emergency contacts yet. Add one so HR can reach someone if needed.
            </p>
          ) : (
            <div className="space-y-3">
              {contacts.map((c, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    {i === 0 ? <Label className="text-xs">Name</Label> : null}
                    <Input value={c.name} placeholder="Full name" onChange={(e) => updateContact(i, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    {i === 0 ? <Label className="text-xs">Relationship</Label> : null}
                    <Input value={c.relationship} placeholder="e.g. Father" onChange={(e) => updateContact(i, { relationship: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    {i === 0 ? <Label className="text-xs">Phone</Label> : null}
                    <Input value={c.phone} placeholder="Phone number" onChange={(e) => updateContact(i, { phone: e.target.value })} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove contact"
                    onClick={() => setContacts((cur) => cur.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank details */}
      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>
            Used for salary payouts. Changes are sent to HR for approval before they take effect.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bank_name">Bank name</Label>
              <Input id="bank_name" {...form.register("bank_name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_no">Account number</Label>
              <Input
                id="bank_account_no"
                placeholder={employee.profile?.bank_account_no ?? "Enter new account number"}
                {...form.register("bank_account_no")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank_ifsc">IFSC</Label>
              <Input id="bank_ifsc" {...form.register("bank_ifsc")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pan">PAN</Label>
              <Input id="pan" {...form.register("pan")} />
            </div>
            {employee.profile?.pending_bank_detail_change ? (
              <div className="md:col-span-2">
                <Badge variant="warning">Pending bank change · awaiting HR approval</Badge>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          <Save className="h-4 w-4" />
          Save changes
        </Button>
      </div>
    </form>
  );
}

function AvatarUploader({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const name = `${employee.first_name} ${employee.last_name}`;
  const hasPhoto = !!employee.photo_url;

  // Avatars surface in the top bar (/me), the directory and the employee's
  // detail page, so refresh all of those after a change.
  async function refreshEverywhere() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["employee", employee.id] }),
      qc.invalidateQueries({ queryKey: ["me"] }),
      qc.invalidateQueries({ queryKey: ["employees"] }),
      qc.invalidateQueries({ queryKey: ["global-search"] }),
    ]);
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG, JPG, GIF or WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/employees/${employee.id}/avatar`, fd);
      await refreshEverywhere();
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/employees/${employee.id}/avatar`);
      await refreshEverywhere();
      toast.success("Profile photo removed");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5 sm:items-start">
      <div className="relative shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <UserAvatar
          name={name}
          src={employee.photo_url}
          className="h-20 w-20 border-4 border-card shadow-card"
          fallbackClassName="bg-primary/10 text-xl font-semibold text-primary"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={hasPhoto ? "Change profile photo" : "Add profile photo"}
          title={hasPhoto ? "Change profile photo" : "Add profile photo"}
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-white shadow-md ring-2 ring-card transition hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
      </div>
      {hasPhoto ? (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      ) : null}
    </div>
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
