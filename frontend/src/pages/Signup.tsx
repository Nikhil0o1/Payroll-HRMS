import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarCheck2, CheckCircle2, Eye, EyeOff, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";
import {
  isEmailDomainAllowed,
  useAuthPolicy,
  workEmailErrorMessage,
  workEmailHint,
} from "@/lib/auth-policy";
import { useAuthStore } from "@/stores/auth";
import type { Tokens } from "@/types/api";

function buildSchema(allowedDomains: readonly string[] | undefined) {
  return z
    .object({
      first_name: z.string().min(1, "First name is required").max(100),
      last_name: z.string().min(1, "Last name is required").max(100),
      email: z
        .string()
        .email("Enter a valid work email")
        .refine((v) => isEmailDomainAllowed(v, allowedDomains), {
          message: workEmailErrorMessage(allowedDomains),
        }),
      phone: z.string().max(32).optional().or(z.literal("")),
      department: z.string().max(120).optional().or(z.literal("")),
      designation: z.string().max(120).optional().or(z.literal("")),
      date_of_joining: z.string().optional().or(z.literal("")),
      password: z.string().min(8, "At least 8 characters").max(128),
      confirm_password: z.string().min(1, "Please confirm your password"),
    })
    .refine((v) => v.password === v.confirm_password, {
      path: ["confirm_password"],
      message: "Passwords don't match",
    });
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>;

export function SignupPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setTokens = useAuthStore((s) => s.setTokens);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const policy = useAuthPolicy();
  const allowedDomains = policy.data?.allowed_email_domains;
  const emailHint = workEmailHint(allowedDomains);
  const schema = useMemo(() => buildSchema(allowedDomains), [allowedDomains]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      department: "",
      designation: "",
      date_of_joining: "",
      password: "",
      confirm_password: "",
    },
  });

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        phone: values.phone || undefined,
        department: values.department || undefined,
        designation: values.designation || undefined,
        date_of_joining: values.date_of_joining || undefined,
      };
      const r = await api.post<Tokens>("/auth/signup", payload);
      setTokens(r.data.access_token, r.data.refresh_token);
      toast.success("Welcome! Your account is ready.");
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Form side */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-in-up">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-soft">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-[17px]">Payroll</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">HR & Payroll</div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Create your employee account</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            New to the company? Set up your self-service employee account in under a minute.
          </p>

          <form className="mt-8 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" autoComplete="given-name" {...form.register("first_name")} />
                {form.formState.errors.first_name ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.first_name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" autoComplete="family-name" {...form.register("last_name")} />
                {form.formState.errors.last_name ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.last_name.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={
                  allowedDomains && allowedDomains.length > 0
                    ? `you@${allowedDomains[0]}`
                    : "you@company.com"
                }
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              ) : emailHint ? (
                <p className="text-xs text-muted-foreground">{emailHint}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  placeholder="Engineering"
                  {...form.register("department")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  placeholder="Software Engineer"
                  {...form.register("designation")}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" autoComplete="tel" {...form.register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date_of_joining">Date of joining</Label>
                <Input id="date_of_joining" type="date" {...form.register("date_of_joining")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="pr-10"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input
                id="confirm_password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                {...form.register("confirm_password")}
              />
              {form.formState.errors.confirm_password ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.confirm_password.message}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Admin accounts are provisioned by your existing administrator from inside the app.
          </p>
        </div>
      </div>

      {/* Brand / hero side */}
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-sidebar via-[hsl(216_45%_22%)] to-primary text-white">
        <div className="absolute inset-0 bg-grid opacity-[0.07]" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative h-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-2 opacity-95">
            <Wallet className="h-5 w-5" />
            <span className="font-semibold tracking-tight">Payroll</span>
          </div>
          <div className="space-y-4 max-w-md">
            <h2 className="text-[34px] leading-[1.15] font-semibold tracking-tight text-balance">
              Your first day, made simple.
            </h2>
            <p className="text-white/75 text-[15px] leading-relaxed">
              Punch attendance, request leaves, view payslips — everything self-service from
              day one, backed by a full audit trail.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {["One-tap punch", "Apply & track leave", "Download payslips"].map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-medium"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: CalendarCheck2, k: "Attendance", v: "One-tap punch" },
              { icon: CalendarCheck2, k: "Leaves", v: "Apply & track" },
              { icon: Wallet, k: "Payslips", v: "Download PDF" },
            ].map((c) => (
              <div
                key={c.k}
                className="rounded-xl bg-white/8 border border-white/10 p-4 backdrop-blur-sm"
              >
                <c.icon className="h-4 w-4 mb-2 opacity-80" />
                <div className="text-xs uppercase tracking-wide text-white/60">{c.k}</div>
                <div className="text-sm font-medium mt-0.5">{c.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
