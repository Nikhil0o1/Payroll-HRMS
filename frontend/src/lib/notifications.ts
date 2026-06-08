/**
 * Notifications feed — pulls `/notifications` periodically and tracks per-user
 * dismissed state in localStorage so we can show an accurate unread badge
 * without a round-trip on every open.
 *
 * Read-state philosophy: the server is stateless — every meaningful "unread"
 * thing is just a row in a domain table (a pending leave request, a
 * not-yet-acted payroll run, …). The bell tracks per-user dismissed
 * notification IDs locally; everything else counts as unread.
 *
 * The previous implementation used a single ``lastSeenAt`` timestamp. That
 * silently auto-marked-as-read every existing item the moment the user opened
 * the tray, even items they never looked at. The dismissed-set model fixes
 * that: the badge always reflects what's actually in the tray until the user
 * explicitly hits "Mark all read" or clicks an individual item.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { AppNotification, NotificationsResponse } from "@/types/api";

const NOTIFICATIONS_KEY = ["notifications", "feed"] as const;

/** Refresh every minute in the background. Cheap query, server-derived. */
const REFETCH_MS = 60_000;

export function useNotifications() {
  // Only run when authenticated — guards against a 401 storm on the login page.
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () =>
      (await api.get<NotificationsResponse>("/notifications")).data,
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

/** Manually invalidate the feed (e.g. after an admin approves a request). */
export function useInvalidateNotifications() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }), [qc]);
}

// ── Per-user dismissed notification IDs in localStorage ─────────────────

function dismissedKey(userId: number | undefined | null): string {
  // Scope by user so logging out / switching accounts doesn't leak read state.
  return `notifications.dismissedIds:${userId ?? "anon"}`;
}

function readDismissed(userId: number | undefined | null): Set<string> {
  try {
    const raw = window.localStorage.getItem(dismissedKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(userId: number | undefined | null, ids: Set<string>): void {
  try {
    window.localStorage.setItem(dismissedKey(userId), JSON.stringify([...ids]));
  } catch {
    /* private mode / quota — ignore */
  }
}

/**
 * Returns:
 * - `unreadCount`: number of items in `items` not yet acknowledged by the user.
 * - `markAllRead()`: dismiss every item currently in the tray.
 * - `markRead(id)`: dismiss a single notification (used when the user clicks one).
 *
 * Stale dismissed IDs are pruned automatically as the underlying records
 * resolve and disappear from the feed (e.g. a leave gets approved → its
 * `leave-pending-<id>` notification is gone → its dismissed entry is removed
 * so the localStorage set doesn't grow without bound).
 */
export function useUnreadNotifications(items: AppNotification[] | undefined) {
  const me = useAuthStore((s) => s.me);
  const userId = me?.id;

  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(userId));

  // Reload dismissed set when the active user changes (login / logout / switch).
  useEffect(() => {
    setDismissed(readDismissed(userId));
  }, [userId]);

  // Garbage-collect dismissed IDs that no longer appear in the feed.
  useEffect(() => {
    if (!items) return;
    const live = new Set(items.map((i) => i.id));
    setDismissed((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      if (!changed) return prev;
      writeDismissed(userId, next);
      return next;
    });
  }, [items, userId]);

  const unreadCount = useMemo(() => {
    if (!items || items.length === 0) return 0;
    let count = 0;
    for (const n of items) if (!dismissed.has(n.id)) count += 1;
    return count;
  }, [items, dismissed]);

  const markAllRead = useCallback(() => {
    if (!items || items.length === 0) return;
    const next = new Set(items.map((i) => i.id));
    writeDismissed(userId, next);
    setDismissed(next);
  }, [items, userId]);

  const markRead = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        writeDismissed(userId, next);
        return next;
      });
    },
    [userId],
  );

  return { unreadCount, markAllRead, markRead };
}
