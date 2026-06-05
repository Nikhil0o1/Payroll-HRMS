import { cn } from "@/lib/utils";

/** Lightweight, dependency-free progress bar. `value` is 0–100. */
export function Progress({
  value,
  className,
  indicatorClassName,
  color,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full bg-primary transition-all duration-500", indicatorClassName)}
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
