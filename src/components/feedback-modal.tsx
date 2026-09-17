"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Lightbulb, HelpCircle, MessageSquare } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "bug" as const, label: "Something isn't working", icon: AlertTriangle },
  { value: "idea" as const, label: "I have an idea", icon: Lightbulb },
  { value: "confusing" as const, label: "Something feels confusing", icon: HelpCircle },
  { value: "other" as const, label: "Other", icon: MessageSquare },
];

/**
 * A short, one-way feedback/bug-report mailbox (§23/§24) — no voting board,
 * no ticket viewer, no reply thread. Auto-captures only the route it was
 * opened from; everything else safe-to-collect (browser/OS/device/app
 * version) is added server-side from the request itself, never typed by
 * the user or read from the page.
 */
export function FeedbackModal() {
  const open = useUIStore((s) => s.feedbackOpen);
  const onClose = useUIStore((s) => s.closeFeedback);
  const pathname = usePathname();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function reset() {
    setCategory("idea");
    setMessage("");
  }

  async function send() {
    if (!message.trim()) {
      toast.error("Add a few words so we know what you mean.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, route: pathname }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't send your feedback.");
      }
      toast.success("Thanks — we read every one of these.");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your feedback. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      className="max-w-md"
      labelledBy="feedback-title"
    >
      <ModalHeader title="Feedback" subtitle="Short and honest is perfect." onClose={onClose} />
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-[12.5px] transition-colors cursor-pointer",
                category === c.value
                  ? "border-accent bg-accent-soft text-text-primary"
                  : "border-border text-text-secondary hover:border-border-strong"
              )}
            >
              <c.icon size={14} className={category === c.value ? "text-accent" : "text-text-muted"} />
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="feedback-message" className="text-[12px] font-medium text-text-secondary">
            What&apos;s on your mind?
          </label>
          <textarea
            id="feedback-message"
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Tell us what happened, or what you wish worked differently…"
            className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void send()} disabled={sending}>
          {sending ? "Sending…" : "Send feedback"}
        </Button>
      </div>
    </Modal>
  );
}
