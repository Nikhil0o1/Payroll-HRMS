import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  Building2,
  Cake,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ClipboardCheck,
  ClipboardList,
  Clock,
  HelpCircle,
  History,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  Megaphone,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  UserCircle2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useOrgBranding } from "@/components/brand";
import { GlobalSearch } from "@/components/global-search";
import { useNotifications, useUnreadNotifications } from "@/lib/notifications";
import type { AppNotification } from "@/types/api";

const SUPPORT_EMAIL = "hr@yanthraa.com";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Payroll support request",
)}`;

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const ADMIN_NAV: NavEntry[] = [
  { to: "/", label: "Home", icon: LayoutGrid, end: true },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/payroll", label: "Pay Runs", icon: Wallet },
  {
    label: "Approvals",
    icon: ClipboardCheck,
    children: [
      { to: "/leaves", label: "Leaves", icon: CalendarCheck2 },
      { to: "/regularizations", label: "Regularizations", icon: History },
    ],
  },
  { to: "/holidays", label: "Holidays", icon: CalendarDays },
  { to: "/birthdays", label: "Birthdays", icon: Cake },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

// Configuration pages — rendered flat in the sidebar (no "Settings" wrapper),
// separated from the primary nav by a thin divider.
const ADMIN_CONFIG: NavItem[] = [
  { to: "/settings/organisation", label: "Organisation", icon: Building2 },
  { to: "/settings/work-locations", label: "Work Locations", icon: MapPin },
  { to: "/settings/shifts", label: "Shifts", icon: Clock },
  { to: "/settings/salary-components", label: "Salary Components", icon: ClipboardList },
  { to: "/settings/pay-schedule", label: "Pay Schedule", icon: CalendarClock },
  { to: "/settings/announcements", label: "Announcements", icon: Megaphone },
  { to: "/settings/users-roles", label: "Users & Roles", icon: Users },
];

const EMPLOYEE_NAV: NavEntry[] = [
  { to: "/", label: "Home", icon: LayoutGrid, end: true },
  { to: "/attendance", label: "Attendance", icon: CalendarClock },
  { to: "/leaves", label: "Leaves", icon: CalendarCheck2 },
  { to: "/regularizations", label: "Regularizations", icon: History },
  { to: "/payslips", label: "My Payslips", icon: ReceiptText },
  { to: "/holidays", label: "Holidays", icon: CalendarDays },
];

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("nav-collapsed") === "1",
  );
  const me = useAuthStore((s) => s.me);
  const refresh = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = rolesAtLeast(me?.role, "HR_ADMIN");
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  const branding = useOrgBranding().data;
  const orgName = branding?.name ?? "—";

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("nav-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  async function handleLogout() {
    try {
      if (refresh) await api.post("/auth/logout", { refresh_token: refresh });
    } catch {
      // ignore
    }
    clear();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  }

  const roleLabel = rolesAtLeast(me?.role, "HR_ADMIN") ? "Admin" : "Employee";

  const displayName = me?.employee
    ? `${me.employee.first_name} ${me.employee.last_name}`
    : me?.email ?? "User";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar (desktop) */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-sidebar sticky top-0 h-screen transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <Sidebar
          nav={nav}
          navConfig={isAdmin ? ADMIN_CONFIG : undefined}
          collapsed={collapsed}
          onCollapseToggle={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in-0"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar animate-in-up">
            <Sidebar
              nav={nav}
              navConfig={isAdmin ? ADMIN_CONFIG : undefined}
              collapsed={false}
              onClose={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-[hsl(240_22%_97%)] sticky top-0 z-30 flex items-center gap-3 pr-3 sm:pr-5">
          <button
            className="lg:hidden ml-3 p-2 rounded-md hover:bg-white/60"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 flex items-center gap-3 pl-3 sm:pl-5">
            {isAdmin ? <GlobalSearch /> : <div className="flex-1" />}
          </div>

          {/* Org name — admins jump to Organisation settings; others see it as a label. */}
          {isAdmin ? (
            <button
              onClick={() => navigate("/settings/organisation")}
              title={orgName}
              className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-white/60 transition-colors max-w-[180px] md:max-w-[280px] lg:max-w-none"
            >
              <span className="truncate lg:overflow-visible lg:text-clip">{orgName}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <span
              title={orgName}
              className="hidden sm:inline-flex shrink-0 items-center px-2.5 py-1.5 text-sm font-medium max-w-[180px] md:max-w-[280px] lg:max-w-none"
            >
              <span className="truncate lg:overflow-visible lg:text-clip">{orgName}</span>
            </span>
          )}

          <div className="flex items-center gap-0.5">
            <NotificationsButton />
            <HelpButton />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="ml-1 rounded-full ring-1 ring-border transition hover:ring-primary/40"
                aria-label="Account menu"
              >
                <UserAvatar
                  name={displayName}
                  src={me?.employee?.photo_url}
                  className="h-8 w-8"
                  fallbackClassName="bg-primary/10 text-primary text-xs font-semibold"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[15rem]">
              <DropdownMenuLabel>
                <div className="font-medium">{displayName}</div>
                <div className="text-xs font-normal text-muted-foreground">{me?.email}</div>
                <div className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {roleLabel}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {me?.employee ? (
                <DropdownMenuItem onSelect={() => navigate("/profile")}>
                  <UserCircle2 className="h-4 w-4" />
                  My profile
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => navigate("/profile?tab=password")}>
                <KeyRound className="h-4 w-4" />
                Change password
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem onSelect={() => navigate("/settings/organisation")}>
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full animate-in-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sidebar ─────────────────────────── */

function Sidebar({
  nav,
  navConfig,
  collapsed,
  onClose,
  onCollapseToggle,
  onLogout,
}: {
  nav: NavEntry[];
  navConfig?: NavItem[];
  collapsed: boolean;
  onClose?: () => void;
  onCollapseToggle?: () => void;
  onLogout?: () => void;
}) {
  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      {/* Brand — the official brightcone.ai logo on a light gradient panel so
          the dark wordmark stays legible on the navy sidebar. Full lockup when
          expanded; just the pyramid mark when collapsed. */}
      <div className={cn("h-16 flex items-center px-3", collapsed ? "justify-center px-0" : "gap-2")}>
        <div
          className={cn(
            "flex items-center rounded-xl ring-1 ring-white/30",
            "bg-gradient-to-b from-white via-slate-50 to-slate-200/95",
            "shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_18px_-4px_rgba(2,6,23,0.65),0_0_34px_-3px_rgba(150,190,255,0.7)]",
            collapsed ? "h-10 w-10 shrink-0 justify-center" : "h-12 flex-1 justify-start px-4",
          )}
        >
          <img
            src={collapsed ? "/brightcone-mark.webp" : "/brightcone-logo.webp"}
            alt="brightcone.ai"
            className={cn("w-auto", collapsed ? "h-7" : "h-9")}
          />
        </div>
        {onClose ? (
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-md text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2.5 py-3 space-y-0.5">
        {nav.map((entry, i) =>
          isGroup(entry) ? (
            <SidebarGroup key={i} group={entry} collapsed={collapsed} />
          ) : (
            <SidebarLink key={entry.to} item={entry} collapsed={collapsed} />
          ),
        )}
        {navConfig && navConfig.length ? (
          <>
            <div className={cn("my-2 border-t border-sidebar-border/70", collapsed ? "mx-2" : "mx-1")} />
            {navConfig.map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </>
        ) : null}
      </nav>

      {/* Footer */}
      <div className="px-2.5 py-3 space-y-1 border-t border-sidebar-border">
        <a
          href={SUPPORT_MAILTO}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-white/[0.06] hover:text-white transition-colors",
            collapsed && "justify-center px-0",
          )}
          title={`Contact Support · ${SUPPORT_EMAIL}`}
        >
          <LifeBuoy className="h-[18px] w-[18px] shrink-0" />
          {!collapsed ? "Contact Support" : null}
        </a>
        {onLogout ? (
          <button
            onClick={onLogout}
            title="Sign out"
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-destructive/15 hover:text-red-300",
              collapsed && "justify-center px-0",
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed ? "Sign out" : null}
          </button>
        ) : null}
        {onCollapseToggle ? (
          <div className={cn("flex pt-0.5", collapsed ? "justify-center" : "justify-end")}>
            <button
              onClick={onCollapseToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
              className="grid h-8 w-8 place-items-center rounded-md text-sidebar-foreground/60 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              <ChevronsLeft className={cn("h-[18px] w-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const linkClass = (active: boolean, collapsed?: boolean) =>
  cn(
    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    collapsed && "justify-center px-0",
    active
      ? "bg-primary text-white shadow-soft"
      : "text-sidebar-foreground hover:bg-white/[0.06] hover:text-white",
  );

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} title={collapsed ? item.label : undefined}>
      {({ isActive }) => (
        <span className={linkClass(isActive, collapsed)}>
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
        </span>
      )}
    </NavLink>
  );
}

function SidebarGroup({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const location = useLocation();
  const childActive = group.children.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  const Icon = group.icon;

  // Collapsed rail: render the group as a single icon linking to its first child.
  if (collapsed) {
    return (
      <NavLink to={group.children[0].to} title={group.label}>
        {() => (
          <span className={linkClass(childActive, true)}>
            <Icon className="h-[18px] w-[18px] shrink-0" />
          </span>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          childActive ? "text-white" : "text-sidebar-foreground hover:bg-white/[0.06] hover:text-white",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-2 ml-4">
          {group.children.map((c) => {
            const CIcon = c.icon;
            return (
              <NavLink key={c.to} to={c.to}>
                {({ isActive }) => (
                  <span
                    className={cn(
                      "flex items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-primary text-white shadow-soft"
                        : "text-sidebar-foreground hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <CIcon className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Top bar pieces ─────────────────────────── */

function NotificationsButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useNotifications();
  const items = q.data?.items ?? [];
  const { unreadCount, markAllRead, markRead } = useUnreadNotifications(items);
  const showBadge = unreadCount > 0;

  // The tray opening / closing is *not* an acknowledgment. Marking-as-read
  // only happens on explicit user action (clicking an item, or the
  // "Mark all read" button). This keeps the badge honest about what's
  // actually waiting for the user.
  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  function handleItemClick(n: AppNotification) {
    setOpen(false);
    markRead(n.id);
    if (n.href) navigate(n.href);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={
            showBadge ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
          title="Notifications"
          className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-white/60 hover:text-foreground transition-colors"
        >
          <Bell className="h-[18px] w-[18px]" />
          {showBadge ? (
            <span
              aria-hidden
              className={cn(
                "absolute -top-0.5 -right-0.5 grid h-4 min-w-[16px] place-items-center rounded-full px-1",
                "bg-destructive text-[10px] font-bold leading-none text-white shadow-sm tabular-nums",
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            {q.data?.total ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                {q.data.total}
              </span>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                markAllRead();
                // Force a re-read by closing and reopening; or just toggle a
                // local state. Simpler: bounce the dropdown closed.
                setOpen(false);
              }}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <div className="max-h-[480px] overflow-y-auto scrollbar-thin">
          {q.isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <BellOff className="h-5 w-5 opacity-60" />
              <div className="font-medium text-foreground">You're all caught up</div>
              <div className="text-xs">Nothing needs your attention right now.</div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <NotificationItem key={n.id} n={n} onClick={handleItemClick} />
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({
  n,
  onClick,
}: {
  n: AppNotification;
  onClick: (n: AppNotification) => void;
}) {
  const Icon =
    n.severity === "success"
      ? CheckCircle2
      : n.severity === "warning"
        ? AlertTriangle
        : Bell;
  const iconClass =
    n.severity === "success"
      ? "text-success"
      : n.severity === "warning"
        ? "text-amber-600"
        : "text-primary";

  let when = "";
  try {
    when = formatDistanceToNowStrict(parseISO(n.timestamp), { addSuffix: true });
  } catch {
    when = "";
  }

  const interactive = Boolean(n.href);
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(n)}
        disabled={!interactive}
        className={cn(
          "w-full text-left flex items-start gap-3 px-3 py-3 transition-colors",
          interactive
            ? "hover:bg-muted/60 cursor-pointer"
            : "cursor-default",
        )}
      >
        <span
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {n.title}
            </p>
            {when ? (
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {when}
              </span>
            ) : null}
          </div>
          {n.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {n.description}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function HelpButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Help"
          title="Help"
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-white/60 hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Need help?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={SUPPORT_MAILTO}>
            <LifeBuoy className="h-4 w-4" />
            Contact support
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
