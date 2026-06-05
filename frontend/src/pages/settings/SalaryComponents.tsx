import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronDown, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CalcType,
  ComponentCategory,
  SalaryComponentDef,
} from "@/types/api";

const CALC_LABEL: Record<CalcType, string> = {
  FIXED: "Fixed amount",
  PERCENT_OF_BASIC: "% of Basic",
  PERCENT_OF_CTC: "% of CTC",
};

const TABS: Array<{ id: ComponentCategory; label: string }> = [
  { id: "EARNING", label: "Earnings" },
  { id: "DEDUCTION", label: "Deductions" },
  { id: "REIMBURSEMENT", label: "Reimbursements" },
];

const schema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, digits, or underscores"),
  name: z.string().min(2).max(120),
  category: z.enum(["EARNING", "DEDUCTION", "REIMBURSEMENT"]),
  calc_type: z.enum(["FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_CTC"]),
  calc_value: z.coerce.number().min(0),
  consider_for_epf: z.boolean(),
  consider_for_esi: z.boolean(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

export default function SalaryComponents() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ComponentCategory>("EARNING");
  const [editing, setEditing] = useState<SalaryComponentDef | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["settings", "salary-components"],
    queryFn: async () =>
      (await api.get<SalaryComponentDef[]>("/settings/salary-components")).data,
  });

  const remove = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/settings/salary-components/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "salary-components"] });
      toast.success("Component removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const all = q.data ?? [];
  const filtered = useMemo(() => all.filter((c) => c.category === tab), [all, tab]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Salary Components</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the earnings, deductions, and reimbursements that make up your salary structure.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Add Component
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {TABS.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={() => {
                  setTab(t.id);
                  setCreating(true);
                }}
              >
                Add {t.label.replace(/s$/, "")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ComponentCategory)}>
        <TabsList className="bg-transparent p-0 border-b border-border w-full justify-start rounded-none gap-1 h-auto">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 text-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-5">
        {q.isLoading ? (
          <Skeleton className="h-[360px] rounded-xl" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={`No ${tab.toLowerCase()} components yet`}
            description="Add your first component to start building salary structures and templates."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Add Component
              </Button>
            }
          />
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold [&>th]:text-left">
                  <th>Name</th>
                  <th>Code</th>
                  <th>Calculation</th>
                  <th className="text-center">EPF</th>
                  <th className="text-center">ESI</th>
                  <th className="text-center">Status</th>
                  <th className="w-12 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary hover:underline cursor-pointer" onClick={() => setEditing(c)}>
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {CALC_LABEL[c.calc_type]}
                      {c.calc_type !== "FIXED" ? ` · ${c.calc_value}%` : c.calc_value > 0 ? ` · ₹ ${c.calc_value}` : ""}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ConsiderPill on={c.consider_for_epf} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ConsiderPill on={c.consider_for_esi} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium",
                          c.is_active ? "text-success" : "text-muted-foreground",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", c.is_active ? "bg-success" : "bg-muted-foreground/40")} />
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => setEditing(c)}
                          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${c.name}?`)) remove.mutate(c.id);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ComponentDialog
        open={creating || !!editing}
        component={editing}
        defaultCategory={tab}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function ConsiderPill({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
        on ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {on ? "Yes" : "No"}
    </span>
  );
}

function ComponentDialog({
  open,
  component,
  defaultCategory,
  onClose,
}: {
  open: boolean;
  component: SalaryComponentDef | null;
  defaultCategory: ComponentCategory;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!component;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: component
      ? {
          code: component.code,
          name: component.name,
          category: component.category,
          calc_type: component.calc_type,
          calc_value: component.calc_value,
          consider_for_epf: component.consider_for_epf,
          consider_for_esi: component.consider_for_esi,
          is_active: component.is_active,
        }
      : {
          code: "",
          name: "",
          category: defaultCategory,
          calc_type: "FIXED",
          calc_value: 0,
          consider_for_epf: false,
          consider_for_esi: false,
          is_active: true,
        },
  });

  const save = useMutation({
    mutationFn: async (v: Values) => {
      if (component) {
        return (await api.patch<SalaryComponentDef>(`/settings/salary-components/${component.id}`, v)).data;
      }
      return (await api.post<SalaryComponentDef>("/settings/salary-components", v)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "salary-components"] });
      toast.success(editing ? "Component updated" : "Component added");
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const calcType = form.watch("calc_type");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit component" : "Add salary component"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">
                Component name<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input {...form.register("name")} placeholder="e.g. House Rent Allowance" />
              {form.formState.errors.name ? (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">
                Code<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                {...form.register("code")}
                placeholder="e.g. HRA"
                className="uppercase"
              />
              {form.formState.errors.code ? (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.code.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">Category</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v as ComponentCategory, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EARNING">Earning</SelectItem>
                  <SelectItem value="DEDUCTION">Deduction</SelectItem>
                  <SelectItem value="REIMBURSEMENT">Reimbursement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Calculation type</Label>
              <Select
                value={form.watch("calc_type")}
                onValueChange={(v) => form.setValue("calc_type", v as CalcType, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                  <SelectItem value="PERCENT_OF_BASIC">% of Basic</SelectItem>
                  <SelectItem value="PERCENT_OF_CTC">% of CTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">
              {calcType === "FIXED" ? "Amount (₹)" : "Percentage"}
            </Label>
            <Input
              type="number"
              step={calcType === "FIXED" ? "1" : "0.01"}
              {...form.register("calc_value")}
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                {...form.register("consider_for_epf")}
              />
              Consider for EPF (employees' provident fund)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                {...form.register("consider_for_esi")}
              />
              Consider for ESI (employee state insurance)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                {...form.register("is_active")}
              />
              Active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? "Save changes" : "Add component"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
