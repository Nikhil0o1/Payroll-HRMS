import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Search, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { AuditLog, Page } from "@/types/api";

export function AuditLogsPage() {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["audit", { entity, action, page }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, size: 25 };
      if (entity) params.entity = entity;
      if (action) params.action = action;
      return (await api.get<Page<AuditLog>>("/audit-logs", { params })).data;
    },
  });

  const items = q.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Append-only history of every sensitive action across the platform."
        icon={ShieldCheck}
      />
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:max-w-[200px]">
            <Label htmlFor="filter-entity">Entity</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="filter-entity"
                className="pl-8"
                placeholder="e.g. payroll_runs"
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:max-w-[200px]">
            <Label htmlFor="filter-action">Action</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="filter-action"
                className="pl-8"
                placeholder="e.g. payroll.lock"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead className="text-right">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={6} message="No audit events match." />
              ) : (
                items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {l.created_at
                        ? format(parseISO(l.created_at), "d MMM yyyy, HH:mm:ss")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {l.actor_email ?? `User #${l.actor_user_id ?? "—"}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {l.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.entity}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.entity_id ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {l.ip ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {q.data && q.data.pages > 1 ? (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="px-2 text-muted-foreground">
                Page {q.data.page} / {q.data.pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= q.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
