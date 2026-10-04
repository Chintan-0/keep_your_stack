"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SaveSharedResourceButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch(`/api/shared-resources/${encodeURIComponent(token)}/save`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save this resource.");
      setDuplicate(!!body.duplicate);
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this resource.");
      setState("error");
    }
  }

  if (state === "saved") {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-[13.5px] text-success">
          <Check size={15} /> {duplicate ? "Already in your library." : "Saved to your library."}
        </p>
        <Link href="/resources" className="text-[13px] font-medium text-accent hover:underline">
          Go to My Stack →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={save} disabled={state === "saving"} className="w-fit">
        <Bookmark size={14} /> {state === "saving" ? "Saving…" : "Save to My Stack"}
      </Button>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
