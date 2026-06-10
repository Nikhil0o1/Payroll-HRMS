import type { ReactNode } from "react";

/**
 * Centered, single-column auth layout used by Login & Signup — the company
 * logo above a clean card on a softly-lit neutral background (Zoho / greytHR
 * style). No marketing hero; just the brand and the task at hand.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#f4f6f9] px-4 py-10">
      {/* subtle ambient brand glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[30rem] w-[46rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#0B86FE]/12 via-[#0BC0A5]/8 to-transparent blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px] animate-in-up">
        {/* hardcoded brightcone.ai logo */}
        <div className="mb-7 flex justify-center">
          <img src="/brightcone-logo.svg" alt="brightcone.ai" className="h-10 w-auto" />
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_50px_-22px_rgba(16,24,40,0.20)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} brightcone.ai · Secure HR &amp; Payroll
        </p>
      </div>
    </div>
  );
}
