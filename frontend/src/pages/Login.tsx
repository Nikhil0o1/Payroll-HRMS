import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
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
    <AuthShell
      title="Sign in"
      subtitle="Use your work email to continue. Admins and employees use the same form."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            placeholder={
              allowedDomains && allowedDomains.length > 0 ? `you@${allowedDomains[0]}` : "you@company.com"
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
          <Label htmlFor="password">Password</Label>
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

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Trouble signing in? Contact your administrator.
      </p>
    </AuthShell>
  );
}
