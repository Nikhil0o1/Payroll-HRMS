import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarCheck2, CheckCircle2, Eye, EyeOff, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuthPolicy, workEmailHint } from "@/lib/auth-policy";
import { useAuthStore } from "@/stores/auth";
import type { Tokens } from "@/types/api";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setTokens = useAuthStore((s) => s.setTokens);
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const policy = useAuthPolicy();
  const allowedDomains = policy.data?.allowed_email_domains;
  const emailHint = workEmailHint(allowedDomains);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  if (accessToken) return <Navigate to="/" replace />;

  async function onSubmit(values: FormValues) {
    try {
      const r = await api.post<Tokens>("/auth/login", values);
      setTokens(r.data.access_token, r.data.refresh_token);
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
      toast.success("Welcome back");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Form side */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-in-up">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-soft">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-[17px]">Payroll</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">HR & Payroll</div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Sign in with your work email. Admins and employees use the same form.
          </p>

          <form className="mt-8 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder={
                  allowedDomains && allowedDomains.length > 0
                    ? `you@${allowedDomains[0]}`
                    : "you@company.com"
                }
                autoComplete="email"
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              ) : emailHint ? (
                <p className="text-xs text-muted-foreground">{emailHint}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
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
            <Button type="submit" className="w-full" loading={form.formState.isSubmitting} size="lg">
              {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            New to the company?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Create an employee account
            </Link>
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Trouble logging in? Contact your HR admin.
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
              Attendance, leave, and payroll — run with confidence.
            </h2>
            <p className="text-white/75 text-[15px] leading-relaxed">
              One clean workspace for your whole team. Punch in, request leave, and
              lock payroll with a full audit trail behind every number.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {["RBAC + audit", "Immutable payroll lock", "Self-service"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: CalendarCheck2, k: "Attendance", v: "Punch IN/OUT" },
              { icon: CalendarCheck2, k: "Leaves", v: "Self-service" },
              { icon: Wallet, k: "Payroll", v: "Lock & ship" },
            ].map((c) => (
              <div key={c.k} className="rounded-xl bg-white/8 border border-white/10 p-4 backdrop-blur-sm">
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
