import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEMANTIC_COLOR_CLASSES, tagColor } from "@/lib/colors";

export function PopularTagsPanel({ tags }: { tags: { id: string; name: string; count: number }[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
          <span aria-hidden="true">🏷️</span> Popular Tags
        </h2>
        <Link href="/resources" className="flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-accent">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5 px-1 pb-1">
        {tags.map((t) => {
          const palette = SEMANTIC_COLOR_CLASSES[tagColor(t.name)];
          return (
            <Link
              key={t.id}
              href={`/resources?tag=${t.id}`}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 font-mono text-[11px] transition-colors hover:brightness-110",
                palette.soft,
                palette.text
              )}
            >
              {t.name}
              <span className="text-text-muted">{t.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
