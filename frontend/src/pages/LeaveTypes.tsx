import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { api, apiErrorMessage } from "@/lib/api";
import type { LeaveType } from "@/types/api";

const schema = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, digits, or underscores"),
  name: z.string().min(2).max(120),
  default_annual_quota: z.coerce.number().min(0).max(366),
  is_paid: z.boolean(),
  color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-character hex color")
    .optional()
    .or(z.literal("")),
});
type Values = z.infer<typeof schema>;

export function LeaveTypesPage() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["leaves", "types"],
    queryFn: async () => (await api.get<LeaveType[]>("/leaves/types")).data,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/leaves/types/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave type removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const types = q.data ?? [];

  return (
    <>
      <PageHeader
        title="Leave Types"
        description="Define the leave categories your company offers and their default annual quotas."
        icon={ClipboardList}
        actions={<EditDialog />}
      />

      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        New employees automatically receive a balance for each type, prorated from their date of
        joining. Existing employees pick up newly added types when they next view their leave page.
      </p>

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-xl" />
          ))}
        </div>
      ) : types.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No leave types yet"
          description="Add your first leave type to enable leave tracking across the company."
          action={<EditDialog />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {types.map((t) => (
            <LeaveTypeCard
              key={t.id}
              type={t}
              onRemove={() => {
                if (
                  confirm(
                    `Remove leave type "${t.code}"? Empty balances will be cleared. This is blocked if any employee has filed a request against it.`,
                  )
                ) {
                  remove.mutate(t.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function LeaveTypeCard({ type: t, onRemove }: { type: LeaveType; onRemove: () => void }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-9 w-9 shrink-0 rounded-lg border ring-1 ring-inset ring-black/5"
            style={{ backgroundColor: t.color ?? "#cbd5e1" }}
            aria-hidden
          />
          <div className="min-w-0">
            <CardTitle className="truncate text-base leading-tight">{t.name}</CardTitle>
            <CardDescription className="mt-0.5 font-mono text-xs">{t.code}</CardDescription>
          </div>
        </div>
        <Badge variant={t.is_paid ? "success" : "muted"}>{t.is_paid ? "Paid" : "Unpaid"}</Badge>
      </CardHeader>
      <CardContent className="mt-auto flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{t.default_annual_quota}</div>
          <div className="text-xs text-muted-foreground">days / year</div>
        </div>
        <div className="flex items-center gap-1">
          <EditDialog existing={t} />
          <SimpleTooltip label="Delete leave type">
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>
      </CardContent>
    </Card>
  );
}

function EditDialog({ existing }: { existing?: LeaveType }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const isEdit = !!existing;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: existing?.code ?? "",
      name: existing?.name ?? "",
      default_annual_quota: existing?.default_annual_quota ?? 0,
      is_paid: existing?.is_paid ?? true,
      color: existing?.color ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const payload = {
        ...v,
        color: v.color ? (v.color.startsWith("#") ? v.color : `#${v.color}`) : null,
      };
      if (isEdit) {
        const { code: _drop, ...patch } = payload;
        return (await api.patch(`/leaves/types/${existing!.id}`, patch)).data;
      }
      return (await api.post("/leaves/types", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success(isEdit ? "Leave type updated" : "Leave type created");
      setOpen(false);
      if (!isEdit) form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <SimpleTooltip label="Edit leave type">
            <Button size="icon-sm" variant="ghost">
              <Pencil className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        ) : (
          <Button>
            <Plus className="h-4 w-4" />
            Add leave type
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing!.code}` : "Add leave type"}</DialogTitle>
          <DialogDescription>
            Codes are uppercase identifiers (e.g. <span className="font-mono">CASUAL</span>,{" "}
            <span className="font-mono">SICK</span>). The annual quota is what each employee
            receives at the start of every calendar year.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                placeholder="CASUAL"
                disabled={isEdit}
                {...form.register("code")}
                onChange={(e) => form.setValue("code", e.target.value.toUpperCase())}
              />
              {form.formState.errors.code ? (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Default annual quota</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                {...form.register("default_annual_quota")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input placeholder="Casual Leave" {...form.register("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color (hex)</Label>
              <Input placeholder="#6366f1" {...form.register("color")} />
              {form.formState.errors.color ? (
                <p className="text-xs text-destructive">{form.formState.errors.color.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="block">Paid leave</Label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" {...form.register("is_paid")} />
                Counts as paid time off
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
