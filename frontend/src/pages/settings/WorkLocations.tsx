import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api, apiErrorMessage } from "@/lib/api";
import type { WorkLocation } from "@/types/api";

const schema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  address_line1: z.string().max(200).optional().or(z.literal("")),
  address_line2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(100).optional().or(z.literal("")),
  pincode: z.string().max(12).optional().or(z.literal("")),
  country: z.string().min(1).max(100),
  is_primary: z.boolean(),
});
type Values = z.infer<typeof schema>;

export default function WorkLocations() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "work-locations"],
    queryFn: async () => (await api.get<WorkLocation[]>("/settings/work-locations")).data,
  });

  const [editing, setEditing] = useState<WorkLocation | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/settings/work-locations/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "work-locations"] });
      toast.success("Work location removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const locations = q.data ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Work Locations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the offices and addresses where your employees work.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Add Work Location
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No work locations yet"
          description="Add your first office address. The primary location is shown on payslips and tax forms."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add Work Location
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {locations.map((loc) => (
            <article
              key={loc.id}
              className="group rounded-xl border border-border bg-card p-5 shadow-soft transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug text-foreground break-words" title={loc.name}>
                    {loc.name}
                  </h3>
                  {loc.is_primary ? (
                    <Badge variant="success" className="mt-1.5 text-[10px]">
                      Filing address
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => setEditing(loc)}
                    aria-label="Edit"
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${loc.name}?`)) remove.mutate(loc.id);
                    }}
                    disabled={loc.is_primary}
                    title={loc.is_primary ? "Cannot remove primary location" : "Remove"}
                    aria-label="Remove"
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
                {loc.address_line1 ? <p>{loc.address_line1}</p> : null}
                {loc.address_line2 ? <p>{loc.address_line2}</p> : null}
                <p>
                  {[loc.city, loc.state, loc.pincode].filter(Boolean).join(", ") || "—"}
                </p>
                <p className="text-xs pt-1">{loc.country}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <LocationDialog
        open={creating || !!editing}
        location={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function LocationDialog({
  open,
  location,
  onClose,
}: {
  open: boolean;
  location: WorkLocation | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!location;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: location
      ? {
          name: location.name,
          address_line1: location.address_line1 ?? "",
          address_line2: location.address_line2 ?? "",
          city: location.city ?? "",
          state: location.state ?? "",
          pincode: location.pincode ?? "",
          country: location.country,
          is_primary: location.is_primary,
        }
      : {
          name: "",
          address_line1: "",
          address_line2: "",
          city: "",
          state: "",
          pincode: "",
          country: "India",
          is_primary: false,
        },
  });

  const save = useMutation({
    mutationFn: async (v: Values) => {
      if (location) {
        return (await api.patch<WorkLocation>(`/settings/work-locations/${location.id}`, v)).data;
      }
      return (await api.post<WorkLocation>("/settings/work-locations", v)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "work-locations"] });
      toast.success(editing ? "Work location updated" : "Work location added");
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit work location" : "Add work location"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="space-y-4"
        >
          <div>
            <Label className="mb-1.5 block text-sm">
              Location name<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input {...form.register("name")} placeholder="e.g. Head Office, MH Branch" />
            {form.formState.errors.name ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Address line 1</Label>
            <Input {...form.register("address_line1")} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Address line 2</Label>
            <Input {...form.register("address_line2")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">City</Label>
              <Input {...form.register("city")} />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">State</Label>
              <Input {...form.register("state")} />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Pincode</Label>
              <Input {...form.register("pincode")} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">
              Country<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input {...form.register("country")} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
              {...form.register("is_primary")}
            />
            Set as primary location (used as the filing address)
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
