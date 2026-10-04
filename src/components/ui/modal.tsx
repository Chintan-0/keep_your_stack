"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Open dialogs, outermost first. Only the top-most dialog handles Tab, so a
// confirmation opened on top of another dialog doesn't fight it for focus.
const trapStack: object[] = [];

// The last element focused outside any dialog. Captured on focus rather than
// at open time, because a dialog's own autofocus can run before its effects.
let lastFocusOutsideDialog: HTMLElement | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "focusin",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest?.('[role="dialog"]')) lastFocusOutsideDialog = target;
    },
    true
  );
}

const FOCUSABLE ='a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  children,
  className,
  labelledBy,
  trapFocus = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
  trapFocus?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !trapFocus) return;
    const token = {};
    trapStack.push(token);
    const previous = lastFocusOutsideDialog;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog || trapStack[trapStack.length - 1] !== token) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => {
      window.removeEventListener("keydown", onTab);
      trapStack.splice(trapStack.indexOf(token), 1);
      previous?.focus?.();
    };
  }, [open, trapFocus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:pt-[10vh]">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 shadow-2xl animate-scale-in",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ModalHeader({
  title,
  onClose,
  subtitle,
  titleId,
}: {
  title: string;
  onClose: () => void;
  subtitle?: string;
  titleId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 id={titleId} className="text-[15px] font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-text-secondary">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="rounded-[var(--radius-sm)] p-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary cursor-pointer"
        aria-label="Close"
      >
        <X size={18} />
      </button>
    </div>
  );
}
