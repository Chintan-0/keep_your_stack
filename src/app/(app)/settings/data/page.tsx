"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, FileJson, FileSpreadsheet, Bookmark, HardDriveDownload, History, ChevronLeft, AlertTriangle } from "lucide-react";
import type { ImportHistoryEntry } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div>
        <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-text-secondary">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ExportButton({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-strong bg-surface-3 px-3.5 py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
    >
      <Icon size={14} /> {label}
    </a>
  );
}

export default function DataPage() {
  const router = useRouter();
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/import/history")
      .then((r) => r.json())
      .then((body) => setHistory(body.history ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <button
        onClick={() => router.push("/settings")}
        className="flex w-fit items-center gap-1 text-[12.5px] text-text-secondary hover:text-text-primary cursor-pointer"
      >
        <ChevronLeft size={14} /> Settings
      </button>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Your Data</h1>
        <p className="mt-1 text-[13px] text-text-secondary">Your library belongs to you — bring it in, or take it anywhere.</p>
      </div>

      <Section title="Import" description="Bring resources into KeepYourStack.">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/import"
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-strong bg-surface-3 px-3.5 py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
          >
            <Upload size={14} /> Import Bookmarks, CSV, or Backup
          </Link>
        </div>
      </Section>

      <Section title="Export" description="Take your library anywhere — no lock-in.">
        <div className="flex flex-wrap gap-2">
          <ExportButton href="/api/export/json" icon={FileJson} label="Export JSON" />
          <ExportButton href="/api/export/csv" icon={FileSpreadsheet} label="Export CSV" />
          <ExportButton href="/api/export/html" icon={Bookmark} label="Export HTML Bookmarks" />
        </div>
        <p className="text-[11.5px] text-text-muted">
          Exports your entire library. To export just your favorites, a stack, or a category, use the Export
          button from that page instead.
        </p>
      </Section>

      <Section title="Backup" description="A complete copy of your library — everything needed to restore it.">
        <ExportButton href="/api/export/json" icon={HardDriveDownload} label="Download Backup" />
        <p className="text-[11.5px] text-text-muted">
          Includes resources, categories, stacks, tags, notes, favorites, archive state, and provenance. Never
          includes your password or login session — there&apos;s nothing to restore there; you sign back in normally.
        </p>
      </Section>

      <Section title="Import History">
        {history.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">No imports yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <div key={h.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 py-2.5">
                <button
                  onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                  className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-[13px] text-text-primary">
                    <History size={13} className="text-text-muted" /> {h.source}
                    {h.filename && <span className="text-text-muted">· {h.filename}</span>}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted">{formatRelativeDate(h.createdAt)}</span>
                </button>
                <p className="mt-1 font-mono text-[11.5px] text-text-secondary">
                  {h.total} found · {h.imported} imported · {h.skipped} skipped
                  {h.failed > 0 && <span className="text-danger"> · {h.failed} failed</span>}
                </p>
                {expandedId === h.id && h.failedItems.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
                    {h.failedItems.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11.5px]">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0 text-danger" />
                        <div className="min-w-0">
                          <p className="truncate text-text-primary">{f.title}</p>
                          <p className="truncate font-mono text-text-muted">{f.url}</p>
                          <p className="text-danger">{f.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Security" description="How imported and exported data is handled.">
        <ul className="flex flex-col gap-1.5 text-[12.5px] text-text-secondary">
          <li>• Imported files are validated server-side — nothing in them is trusted blindly.</li>
          <li>• Only http/https URLs are ever saved — javascript:, data:, and other schemes are rejected.</li>
          <li>• Exported CSV escapes values that could run as spreadsheet formulas.</li>
          <li>• A category, stack, or tag referenced by an import must belong to you — never another account.</li>
          <li>• Exports never include your password, login session, or any other account secret.</li>
        </ul>
      </Section>
    </div>
  );
}
