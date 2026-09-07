"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** May return a Promise — the dialog stays open (buttons disabled) until it resolves, then closes. A thrown/rejected promise leaves the dialog open so the user can retry. */
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Extra controls between the description and the buttons — e.g. a reassignment picker. */
  children?: React.ReactNode;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const result = onConfirm();
    if (result instanceof Promise) {
      setSubmitting(true);
      try {
        await result;
        onClose();
      } catch {
        // Let the caller's own error toast explain it — just keep the
        // dialog open so the user can adjust their choice and retry.
      } finally {
        setSubmitting(false);
      }
    } else {
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} className="max-w-sm">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className={
              danger
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
            }
          >
            <AlertTriangle size={18} />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-[13px] text-text-secondary">{description}</p>
          </div>
        </div>
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} size="sm" onClick={() => void handleConfirm()} disabled={submitting}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
