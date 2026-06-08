import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, Search, Users } from "lucide-react";

import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Employee, Page } from "@/types/api";

const RESULT_LIMIT = 6;

/** Small debounce so we query as the user types without a request per keystroke. */
function useDebounced<T>(value: T, delay = 180): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Global employee search — results appear live while typing (no submit needed),
 * with full keyboard navigation. Wired to the real `/employees?q=` endpoint.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const debounced = useDebounced(query.trim());
  const hasQuery = debounced.length >= 1;

  const search = useQuery({
    queryKey: ["global-search", debounced],
    enabled: hasQuery,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () =>
      (
        await api.get<Page<Employee>>("/employees", {
          params: { q: debounced, size: RESULT_LIMIT, page: 1 },
        })
      ).data,
  });

  const results = useMemo(() => search.data?.items ?? [], [search.data]);
  const total = search.data?.total ?? 0;
  // Any in-flight request for the current query (covers the first fetch, where
  // there's no placeholder data yet, and subsequent keep-previous-data fetches).
  const fetching = hasQuery && search.isFetching;
  const showDropdown = open && hasQuery;

  // Keep the highlighted row in range as results change.
  useEffect(() => {
    setActive(0);
  }, [debounced]);

  // Close on click outside.
  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDropdown]);

  // "/" focuses search from anywhere (skipped while typing in another field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function goToAll() {
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/employees${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`);
  }

  function select(emp: Employee) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    navigate(`/employees/${emp.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showDropdown) {
      if (e.key === "ArrowDown" && hasQuery) setOpen(true);
      return;
    }
    // active === results.length is the "See all results" footer row.
    const max = results.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i >= max ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? max : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < results.length) select(results[active]);
      else goToAll();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div
        className={cn(
          "group flex h-9 items-center rounded-lg border border-input bg-card shadow-soft transition",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15",
        )}
      >
        <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search employees…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="h-full flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <span className="mr-2 flex h-5 items-center">
          {fetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="rounded px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              Clear
            </button>
          ) : (
            <kbd className="hidden select-none items-center rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline-flex">
              /
            </kbd>
          )}
        </span>
      </div>

      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-pop animate-in fade-in-0 zoom-in-95"
        >
          {results.length > 0 ? (
            <>
              <ul className="max-h-[20rem] overflow-y-auto scrollbar-thin py-1.5">
                {results.map((emp, i) => (
                  <li key={emp.id} role="option" aria-selected={active === i}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => select(emp)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                        active === i ? "bg-accent" : "hover:bg-muted/60",
                      )}
                    >
                      <UserAvatar
                        name={`${emp.first_name} ${emp.last_name}`}
                        src={emp.photo_url}
                        className="h-8 w-8 shrink-0 ring-1 ring-border"
                        fallbackClassName="bg-primary/10 text-[11px] font-semibold text-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {emp.first_name} {emp.last_name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[emp.designation, emp.department].filter(Boolean).join(" · ") ||
                            emp.work_email}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {emp.employee_code}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onMouseEnter={() => setActive(results.length)}
                onClick={goToAll}
                className={cn(
                  "flex w-full items-center justify-between border-t border-border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                  active === results.length ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  See all {total} result{total === 1 ? "" : "s"} for “{debounced}”
                </span>
                <kbd className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <CornerDownLeft className="h-3 w-3" />
                </kbd>
              </button>
            </>
          ) : fetching ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No employees match “{debounced}”.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
