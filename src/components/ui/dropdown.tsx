"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
  /** Plain-text form of `label`, for when it's not already a string (e.g. an icon + name). */
  searchLabel?: string;
}

/**
 * A custom-styled, single-select dropdown — replaces the browser's native
 * `<select>` popup (which can't be themed) with one that matches
 * KeepYourStack's own surfaces/borders/accent color in both light and dark
 * mode. Same controlled value/onChange shape as a native select, so it's a
 * drop-in swap everywhere one was used for a single choice.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  panelClassName,
  size = "md",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  panelClassName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const selectedIndex = Math.max(
    options.findIndex((o) => o.value === value),
    0
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[highlighted];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlighted, options]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setHighlighted(selectedIndex);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 text-left text-text-primary transition-colors hover:border-border-strong/80 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8 px-2 text-[12.5px]" : "h-9 px-2.5 text-[13px]",
          className
        )}
      >
        <span className={cn("truncate", !selected && "text-text-muted")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 top-full z-50 mt-1 max-h-64 min-w-full overflow-y-auto rounded-[var(--radius-md)] border border-border-strong bg-surface-2 py-1 shadow-2xl animate-fade-in",
            panelClassName
          )}
        >
          {options.length === 0 && (
            <p className="px-3 py-2 text-[12.5px] text-text-muted">No options</p>
          )}
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] cursor-pointer",
                i === highlighted ? "bg-surface-3 text-text-primary" : "text-text-secondary",
                o.value === value && "text-text-primary"
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={13} className="shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
