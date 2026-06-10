import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Cake, Check, Gift, Mail, PartyPopper, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BirthdayItem, BirthdayWishResult } from "@/types/api";

export function BirthdaysPage() {
  const q = useQuery({
    queryKey: ["birthdays"],
    queryFn: async () => (await api.get<BirthdayItem[]>("/birthdays")).data,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const items = q.data ?? [];
  const todays = useMemo(() => items.filter((i) => i.is_today), [items]);
  const upcoming = useMemo(() => items.filter((i) => !i.is_today), [items]);
  const thisMonth = useMemo(() => {
    const m = new Date().getMonth() + 1;
    return items.filter((i) => i.month === m).length;
  }, [items]);

  // Group upcoming by the month of the next occurrence, preserving sort order.
  const grouped = useMemo(() => {
    const map = new Map<string, BirthdayItem[]>();
    for (const i of upcoming) {
      const key = format(parseISO(i.next_birthday), "MMMM yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return Array.from(map.entries());
  }, [upcoming]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Birthdays</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {todays.length > 0 ? `${todays.length} today · ` : ""}
          {thisMonth} this month · {items.length} total · updates live from employee profiles
        </p>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Cake}
          title="No birthdays yet"
          description="Birthdays appear here automatically once employees have a date of birth on their profile."
        />
      ) : (
        <>
          {todays.length > 0 ? <TodaySection items={todays} /> : null}

          {grouped.length > 0 ? (
            <div className="space-y-5">
              {grouped.map(([month, rows]) => (
                <section key={month}>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {month}
                    </h2>
                    <span className="text-[11px] text-muted-foreground">· {rows.length}</span>
                    <div className="h-px flex-1 bg-border/70" />
                  </div>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {rows.map((b) => (
                      <BirthdayRow key={b.employee_id} b={b} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Today's celebratory banner ──────────────────────────────────────────────

function TodaySection({ items }: { items: BirthdayItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <div className="flex items-center gap-2 border-b border-primary/15 px-4 py-2.5">
        <PartyPopper className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-primary">
          {items.length} birthday{items.length > 1 ? "s" : ""} today
        </span>
      </div>
      <div className="divide-y divide-primary/10">
        {items.map((b) => (
          <BirthdayRow key={b.employee_id} b={b} highlight />
        ))}
      </div>
    </div>
  );
}

// ─── A single birthday row (avatar + meta + send button) ─────────────────────

function BirthdayRow({ b, highlight }: { b: BirthdayItem; highlight?: boolean }) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: async (force: boolean) =>
      (await api.post<BirthdayWishResult>(`/birthdays/${b.employee_id}/send`, null, { params: { force } }))
        .data,
    onSuccess: (res) => {
      if (res.already_wished) toast.message(res.message);
      else if (res.sent) toast.success(res.message);
      else toast.warning(res.message);
      qc.invalidateQueries({ queryKey: ["birthdays"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const date = parseISO(b.next_birthday);
  const when = b.is_today
    ? "Today 🎉"
    : b.days_until === 1
      ? "Tomorrow"
      : `in ${b.days_until} days`;

  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", highlight ? "px-4" : "hover:bg-muted/40")}>
      {/* Date chip */}
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-center leading-none",
          b.is_today ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <div>
          <div className="text-[9px] font-semibold uppercase">{format(date, "MMM")}</div>
          <div className="mt-0.5 text-base font-bold tabular-nums">{format(date, "d")}</div>
        </div>
      </div>

      <UserAvatar
        name={b.name}
        src={b.photo_url}
        className="h-9 w-9 shrink-0"
        fallbackClassName="bg-primary/10 text-primary text-xs font-semibold"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={b.name}>
          {b.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {b.designation ? `${b.designation} · ` : ""}
          {b.turning_age ? `turns ${b.turning_age}` : format(date, "d MMM")} · {when}
        </p>
      </div>

      {/* Send / wished state */}
      {b.wished_this_year ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" /> Wished
          </span>
          <button
            type="button"
            title="Resend wishes"
            aria-label="Resend wishes"
            disabled={send.isPending}
            onClick={() => send.mutate(true)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", send.isPending && "animate-spin")} />
          </button>
        </div>
      ) : (
        <Button
          size="sm"
          variant={b.is_today ? "default" : "outline"}
          loading={send.isPending}
          onClick={() => send.mutate(false)}
          className="shrink-0"
        >
          {b.is_today ? <Gift className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          Send wishes
        </Button>
      )}
    </div>
  );
}
