import { Badge } from "@/components/ui/badge";
import type {
  AttendanceStatus,
  LeaveStatus,
  PayrollStatus,
  RegularizationStatus,
  EmployeeStatus,
} from "@/types/api";

type Variant = React.ComponentProps<typeof Badge>["variant"];

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const map: Record<AttendanceStatus, { label: string; variant: Variant }> = {
    PRESENT: { label: "Present", variant: "success" },
    HALF_DAY: { label: "Half Day", variant: "warning" },
    ABSENT: { label: "Absent", variant: "destructive" },
    ON_LEAVE: { label: "On Leave", variant: "secondary" },
    HOLIDAY: { label: "Holiday", variant: "muted" },
    WEEKEND: { label: "Weekend", variant: "muted" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function LeaveBadge({ status }: { status: LeaveStatus }) {
  const map: Record<LeaveStatus, { label: string; variant: Variant }> = {
    PENDING: { label: "Pending", variant: "warning" },
    APPROVED: { label: "Approved", variant: "success" },
    REJECTED: { label: "Rejected", variant: "destructive" },
    CANCELLED: { label: "Cancelled", variant: "muted" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function RegularizationBadge({ status }: { status: RegularizationStatus }) {
  const map: Record<RegularizationStatus, { label: string; variant: Variant }> = {
    PENDING: { label: "Pending", variant: "warning" },
    APPROVED: { label: "Approved", variant: "success" },
    REJECTED: { label: "Rejected", variant: "destructive" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  const map: Record<PayrollStatus, { label: string; variant: Variant }> = {
    DRAFT: { label: "Draft", variant: "muted" },
    REVIEW: { label: "Review", variant: "warning" },
    APPROVED: { label: "Approved", variant: "success" },
    LOCKED: { label: "Locked", variant: "default" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return status === "ACTIVE" ? (
    <Badge variant="success">Active</Badge>
  ) : (
    <Badge variant="muted">Inactive</Badge>
  );
}
