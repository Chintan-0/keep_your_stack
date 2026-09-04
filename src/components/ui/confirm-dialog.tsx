"use client";

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
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} className="max-w-sm">
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
