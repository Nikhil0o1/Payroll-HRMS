import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  KeyRound,
  Plane,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, apiErrorMessage } from "@/lib/api";
import { monthLabel } from "@/lib/utils";
import type { Page, PayrollRun, StepUpToken } from "@/types/api";

function ReportCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-base leading-tight">{title}</CardTitle>
          <CardDescription className="mt-0.5">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">{children}</CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [runId, setRunId] = useState<number | null>(null);

  const runs = useQuery({
    queryKey: ["payroll", "runs-for-reports"],
    queryFn: async () =>
      (await api.get<Page<PayrollRun>>("/payroll/runs", { params: { page: 1, size: 50 } })).data,
  });

  async function download(path: string, params: Record<string, string | number>, filename: string) {
    try {
      const r = await api.get(path, { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  const yearOptions = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Generate and download Excel exports for attendance, leaves, payroll and employees."
        icon={FileSpreadsheet}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard
          icon={CalendarClock}
          title="Attendance report"
          description="Per employee, per day for a calendar month."
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {monthLabel(2024, i + 1).split(" ")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() =>
              download("/reports/attendance", { year, month }, `attendance_${year}_${month}.xlsx`)
            }
          >
            <Download className="h-4 w-4" /> Download
          </Button>
        </ReportCard>

        <ReportCard
          icon={Plane}
          title="Leave report"
          description="All leave requests for the year."
        >
          <div className="space-y-1.5 max-w-[180px]">
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={() => download("/reports/leaves", { year }, `leaves_${year}.xlsx`)}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </ReportCard>

        <ReportCard
          icon={Wallet}
          title="Payroll report"
          description="Detailed Excel of a specific payroll run."
        >
          <div className="space-y-1.5">
            <Label>Run</Label>
            <Select value={runId ? String(runId) : ""} onValueChange={(v) => setRunId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a run" />
              </SelectTrigger>
              <SelectContent>
                {(runs.data?.items ?? []).map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {monthLabel(r.period_year, r.period_month)} · {r.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={!runId}
            onClick={() =>
              download("/reports/payroll", { run_id: runId! }, `payroll_run_${runId}.xlsx`)
            }
          >
            <Download className="h-4 w-4" /> Download
          </Button>
          <BankTransferExportButton runId={runId} />
        </ReportCard>

        <ReportCard
          icon={Users}
          title="Employee directory"
          description="All employees with employment details."
        >
          <Button className="w-full" onClick={() => download("/reports/employees", {}, `employees.xlsx`)}>
            <FileSpreadsheet className="h-4 w-4" /> Download
          </Button>
        </ReportCard>
      </div>
    </>
  );
}

function BankTransferExportButton({ runId }: { runId: number | null }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const exportBankTransfer = async () => {
    if (!runId) return;
    try {
      const step = await api.post<StepUpToken>("/auth/step-up", {
        password,
        purpose: "BANK_TRANSFER_EXPORT",
      });
      const r = await api.get("/reports/bank-transfer", {
        params: { run_id: runId },
        responseType: "blob",
        headers: { "X-Step-Up-Token": step.data.access_token },
      });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `bank_transfer_run_${runId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setPassword("");
      setOpen(false);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline" disabled={!runId}>
          <KeyRound className="h-4 w-4" /> Bank transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bank transfer export</DialogTitle>
          <DialogDescription>Confirm your password to continue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bank-transfer-password">Password</Label>
          <Input
            id="bank-transfer-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!password || !runId} onClick={exportBankTransfer}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
