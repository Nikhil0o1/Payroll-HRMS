import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import type { OrganisationProfile as Org } from "@/types/api";

const schema = z.object({
  name: z.string().min(2, "Name is required").max(200),
  legal_name: z.string().max(200).optional().or(z.literal("")),
  industry: z.string().max(100).optional().or(z.literal("")),
  business_location: z.string().min(1).max(100),
  address_line1: z.string().max(200).optional().or(z.literal("")),
  address_line2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(100).optional().or(z.literal("")),
  pincode: z.string().max(12).optional().or(z.literal("")),
  date_format: z.string().min(1).max(20),
  currency: z.string().min(1).max(8),
});
type Values = z.infer<typeof schema>;

const DATE_FORMATS = [
  { value: "dd/MM/yyyy", label: "dd/MM/yyyy  (09/12/2026)" },
  { value: "MM/dd/yyyy", label: "MM/dd/yyyy  (12/09/2026)" },
  { value: "yyyy-MM-dd", label: "yyyy-MM-dd  (2026-12-09)" },
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"];

const COUNTRIES = ["India", "United States", "United Kingdom", "United Arab Emirates", "Singapore", "Australia"];

export default function OrganisationProfile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "organisation"],
    queryFn: async () => (await api.get<Org>("/settings/organisation")).data,
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      legal_name: "",
      industry: "",
      business_location: "India",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      pincode: "",
      date_format: "dd/MM/yyyy",
      currency: "INR",
    },
  });

  useEffect(() => {
    if (q.data) {
      form.reset({
        name: q.data.name,
        legal_name: q.data.legal_name ?? "",
        industry: q.data.industry ?? "",
        business_location: q.data.business_location,
        address_line1: q.data.address_line1 ?? "",
        address_line2: q.data.address_line2 ?? "",
        city: q.data.city ?? "",
        state: q.data.state ?? "",
        pincode: q.data.pincode ?? "",
        date_format: q.data.date_format,
        currency: q.data.currency,
      });
    }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (v: Values) =>
      (await api.put<Org>("/settings/organisation", v)).data,
    onSuccess: (data) => {
      qc.setQueryData(["settings", "organisation"], data);
      qc.invalidateQueries({ queryKey: ["org", "branding"] });
      toast.success("Organisation profile saved");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, GIF, SVG, or WebP).");
      return;
    }
    if (file.size > 1_048_576) {
      toast.error("Logo must be 1 MB or smaller.");
      return;
    }
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Don't set Content-Type manually — axios will let the browser add it
      // along with the required `boundary=...` parameter for multipart bodies.
      const { data } = await api.post<Org>("/settings/organisation/logo", fd);
      qc.setQueryData(["settings", "organisation"], data);
      qc.invalidateQueries({ queryKey: ["org", "branding"] });
      toast.success("Logo updated");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    setLogoUploading(true);
    try {
      const { data } = await api.delete<Org>("/settings/organisation/logo");
      qc.setQueryData(["settings", "organisation"], data);
      qc.invalidateQueries({ queryKey: ["org", "branding"] });
      toast.success("Logo removed");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLogoUploading(false);
    }
  }

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-[600px] rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Settings
        </span>
        {q.data ? (
          <span className="text-xs text-muted-foreground">· ID {q.data.id}</span>
        ) : null}
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight mb-6">Organisation Profile</h1>

      <form
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-8"
      >
        {/* Logo + name */}
        <Section title="Identity">
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">
            <div>
              <Label className="block mb-2">Organisation Logo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLogo(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="group relative grid h-28 w-28 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={q.data?.logo_key ? "Replace organisation logo" : "Upload organisation logo"}
              >
                {q.data?.logo_key ? (
                  <>
                    <img
                      src={q.data.logo_key}
                      alt="Organisation logo"
                      className="h-full w-full object-contain p-2"
                    />
                    <span className="absolute inset-0 bg-foreground/55 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <Upload className="h-4 w-4" />
                      Replace
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    <Building2 className="h-7 w-7" />
                    <span className="text-[11px] font-medium uppercase tracking-wide">
                      Upload
                    </span>
                  </div>
                )}
              </button>
              {q.data?.logo_key ? (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={logoUploading}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove logo
                </button>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Shown on payslips. 240×240, max 1MB.
              </p>
            </div>

            <div className="space-y-5">
              <Field label="Organisation Name" required error={form.formState.errors.name?.message}>
                <Input {...form.register("name")} placeholder="Your organisation name" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The registered business name shown on every payslip and form.
                </p>
              </Field>
              <Field label="Legal Name" error={form.formState.errors.legal_name?.message}>
                <Input {...form.register("legal_name")} placeholder="Registered legal name" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Business Location" required>
                  <Select
                    value={form.watch("business_location")}
                    onValueChange={(v) => form.setValue("business_location", v, { shouldDirty: true })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Industry">
                  <Input {...form.register("industry")} placeholder="e.g. Software" />
                </Field>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Locale">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[680px]">
            <Field label="Date Format" required>
              <Select
                value={form.watch("date_format")}
                onValueChange={(v) => form.setValue("date_format", v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Currency" required>
              <Select
                value={form.watch("currency")}
                onValueChange={(v) => form.setValue("currency", v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Organisation Address">
          <p className="text-sm text-muted-foreground -mt-2 mb-4">
            Used as the address of your primary work location and shown on tax forms.
          </p>
          <div className="space-y-5 max-w-[860px]">
            <Field label="Address line 1">
              <Textarea
                rows={2}
                {...form.register("address_line1")}
                placeholder="Building, street"
              />
            </Field>
            <Field label="Address line 2">
              <Input {...form.register("address_line2")} placeholder="Area / landmark" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="City">
                <Input {...form.register("city")} />
              </Field>
              <Field label="State">
                <Input {...form.register("state")} />
              </Field>
              <Field label="Pincode">
                <Input {...form.register("pincode")} />
              </Field>
            </div>
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => q.data && form.reset()}
            disabled={!form.formState.isDirty}
          >
            Discard
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="block mb-1.5 text-sm">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
