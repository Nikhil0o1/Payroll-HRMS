import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type Tone = "default" | "primary" | "success" | "warning" | "destructive" | "info";

const toneTile: Record<Tone, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  destructive: "bg-destructive/12 text-destructive",
  info: "bg-info/12 text-info",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  trend,
  to,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Positive => up/green, negative => down/red. */
  trend?: { value: number; label?: string } | null;
  to?: string;
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        "p-5 flex items-start justify-between gap-3 transition-shadow",
        to && "hover:shadow-card cursor-pointer",
        className,
      )}
    >
      <div className="space-y-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium truncate">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular tracking-tight">{value}</p>
        <div className="flex items-center gap-2">
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trend.value >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {trend.value >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend.value)}%
              {trend.label ? <span className="text-muted-foreground font-normal"> {trend.label}</span> : null}
            </span>
          ) : null}
          {hint ? <p className="text-xs text-muted-foreground truncate">{hint}</p> : null}
        </div>
      </div>
      {Icon ? (
        <div className={cn("rounded-lg h-10 w-10 flex items-center justify-center shrink-0", toneTile[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
