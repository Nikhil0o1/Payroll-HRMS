import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
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
  // First account to be created bootstraps the org as its administrator.
  const isFirstAdmin = policy.data?.needs_setup === true;
  const schema = useMemo(() => buildSchema(allowedDomains), [allowedDomains]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      confirm_password: "",
    },
  });

  if (accessToken) return <Navigate to="/" replace />;

  async function onSubmit(values: FormValues) {
    try {
      const r = await api.post<Tokens>("/auth/signup", {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      setTokens(r.data.access_token, r.data.refresh_token);
      toast.success(isFirstAdmin ? "Organisation ready — you're the admin." : "Welcome! Your account is ready.");
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <AuthShell
      title={isFirstAdmin ? "Set up your organisation" : "Create your account"}
      subtitle={
        isFirstAdmin
          ? "You're the first user — this account becomes the administrator for your company."
          : "Sign up with your work email to get started."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {isFirstAdmin ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            This is the first account, so it will be created as the{" "}
            <span className="font-semibold">administrator</span>. Everyone who signs up after you
            joins as an employee.
          </span>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" autoComplete="given-name" {...form.register("first_name")} />
            {form.formState.errors.first_name ? (
              <p className="text-xs text-destructive">{form.formState.errors.first_name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">Last name</Label>
            <Input id="last_name" autoComplete="family-name" {...form.register("last_name")} />
            {form.formState.errors.last_name ? (
              <p className="text-xs text-destructive">{form.formState.errors.last_name.message}</p>
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
              allowedDomains && allowedDomains.length > 0 ? `you@${allowedDomains[0]}` : "you@company.com"
            }
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
            <p className="text-xs text-destructive">{form.formState.errors.confirm_password.message}</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "Creating account…"
            : isFirstAdmin
              ? "Create admin account"
              : "Create account"}
        </Button>
      </form>

      {!isFirstAdmin ? (
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Admins are set up by your organisation. Most employees are added by HR and receive a
          welcome email.
        </p>
      ) : null}
    </AuthShell>
  );
}
