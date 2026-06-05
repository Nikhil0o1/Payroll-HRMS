import { Link } from "react-router-dom";
import { Compass, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="relative grid min-h-[70vh] place-items-center overflow-hidden px-6 py-24 text-center">
      <div className="absolute inset-0 bg-grid opacity-[0.04]" />
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-soft">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Payroll</span>
        </div>

        <p className="mt-10 bg-gradient-to-br from-primary to-info bg-clip-text text-7xl font-semibold tracking-tight text-transparent">
          404
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">This page wandered off.</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The page you're looking for doesn't exist, was moved, or you may not have access to it.
        </p>

        <Button className="mt-7" size="lg" asChild>
          <Link to="/">
            <Compass className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
