import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MIN = 2;
const MAX = 500;

export function RejectReasonDialog({
  open,
  onOpenChange,
  title = "Reject request",
  description = "Tell the employee why this is being declined. They will see this note in their view.",
  subjectLabel,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  /** Optional one-line summary of the request being rejected, e.g. "Casual leave · 12 Jun – 14 Jun · Priya Sharma". */
  subjectLabel?: string;
  loading?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN;
  const tooLong = trimmed.length > MAX;
  const invalid = tooShort || tooLong;

  async function handleConfirm() {
    setTouched(true);
    if (invalid) return;
    await onConfirm(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-destructive/10 text-destructive">
              <X className="h-4 w-4" />
            </span>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {subjectLabel ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            {subjectLabel}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="reject-reason" className="flex items-center justify-between">
            <span>
              Reason for rejection
              <span className="ml-0.5 text-destructive">*</span>
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {trimmed.length}/{MAX}
            </span>
          </Label>
          <Textarea
            id="reject-reason"
            rows={4}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Already on approved leave that week — please reapply for a different date."
            aria-invalid={touched && invalid}
          />
          {touched && tooShort ? (
            <p className="text-xs text-destructive">
              Please enter at least {MIN} characters.
            </p>
          ) : null}
          {tooLong ? (
            <p className="text-xs text-destructive">
              Reason must be {MAX} characters or fewer.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={loading}
            disabled={invalid}
            onClick={handleConfirm}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
