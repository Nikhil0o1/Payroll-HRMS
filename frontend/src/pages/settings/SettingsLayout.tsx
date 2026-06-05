import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  MapPin,
  ReceiptText,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "organisation", label: "Organisation Profile", icon: Building2 },
  { to: "work-locations", label: "Work Locations", icon: MapPin },
  { to: "salary-components", label: "Salary Components", icon: ClipboardList },
  { to: "salary-templates", label: "Salary Templates", icon: ReceiptText },
  { to: "pay-schedule", label: "Pay Schedule", icon: CalendarClock },
  { to: "users-roles", label: "Users & Roles", icon: Users },
] as const;

export function SettingsLayout() {
  const navigate = useNavigate();
  return (
    // Break out of AppLayout's content padding so the rail can sit flush.
    // The AppLayout hides its main navy nav on /settings/* — this rail replaces it.
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 flex min-h-[calc(100vh-3.5rem)] bg-background">
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-border bg-card">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-5 pt-5 pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <h2 className="px-5 pb-4 text-[20px] font-semibold tracking-tight">Settings</h2>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-6 space-y-0.5">
          {ITEMS.map((it) => (
            <NavLink key={it.to} to={it.to}>
              {({ isActive }) => (
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <it.icon className="h-[18px] w-[18px] shrink-0" />
                  {it.label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 overflow-x-hidden">
        <div className="px-6 lg:px-10 py-6 lg:py-8 max-w-[1100px]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
