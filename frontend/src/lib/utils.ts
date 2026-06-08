import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined, currency = "INR"): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n as number);
}

/**
 * Indian-style abbreviated currency: 999 → ₹999, 20,000 → ₹20K,
 * 2,40,000 → ₹2.4L, 1,25,00,000 → ₹1.25Cr.
 *
 * Use this for tight spaces (chart annotations, sparkline labels, etc.) where
 * the full ₹X,XX,XXX.XX form would overflow. Falls back to the full formatter
 * if the currency isn't INR — abbreviations don't translate well across locales.
 */
export function formatCompactCurrency(
  value: number | string | null | undefined,
  currency = "INR",
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (currency !== "INR") return formatCurrency(n, currency);
  const num = n as number;
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  const round = (v: number) => {
    const r = Math.round(v * 100) / 100;
    return r.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };
  if (abs >= 1_00_00_000) return `${sign}₹${round(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${round(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${round(abs / 1_000)}K`;
  return `${sign}₹${round(abs)}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n as number);
}

/** App business timezone. Attendance timestamps come from the API as UTC
 * (…Z); we always present them in IST regardless of the viewer's device tz. */
export const APP_TIME_ZONE = "Asia/Kolkata";

/** Format an ISO timestamp as IST time of day, e.g. "15:04". */
export function formatISTTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Format an ISO timestamp as a full IST date + time, e.g. "5 Jun 2026, 15:04". */
export function formatISTDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function minutesToHours(minutes: number | null | undefined): string {
  if (!minutes) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}
