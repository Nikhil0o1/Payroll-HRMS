import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Megaphone, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiErrorMessage } from "@/lib/api";
import type { Announcement } from "@/types/api";

const schema = z.object({
  title: z.string().min(2, "Title is required").max(200),
  body: z.string().min(2, "Message is required").max(2000),
});
type Values = z.infer<typeof schema>;

export default function Announcements() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await api.get<Announcement[]>("/announcements")).data,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/announcements/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const items = q.data ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Announcements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Post company updates. They appear on every employee's dashboard.
          </p>
        </div>
        <CreateDialog />
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Post your first announcement — it'll show up on every employee's dashboard."
          action={<CreateDialog />}
        />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <article
              key={a.id}
              className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-soft"
            >
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug text-foreground">{a.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {a.created_by_name ? `${a.created_by_name} · ` : ""}
                  {a.created_at ? format(parseISO(a.created_at), "d MMM yyyy, h:mm a") : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm("Remove this announcement?")) remove.mutate(a.id);
                }}
                aria-label="Remove"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", body: "" },
  });

  const create = useMutation({
    mutationFn: async (v: Values) => (await api.post<Announcement>("/announcements", v)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement posted");
      setOpen(false);
      form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) form.reset(); }}>
      <DialogTrigger asChild>
        <Button className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          New announcement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-sm">
              Title<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input {...form.register("title")} placeholder="e.g. Payroll processing for June 2026" />
            {form.formState.errors.title ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.title.message}</p>
            ) : null}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">
              Message<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea rows={4} {...form.register("body")} placeholder="Write the announcement details…" />
            {form.formState.errors.body ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.body.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Post announcement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
