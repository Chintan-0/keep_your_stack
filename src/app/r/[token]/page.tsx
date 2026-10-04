import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getSharedResourceByToken } from "@/lib/data/resource-shares";
import { createClient } from "@/lib/supabase/server";
import { decodeHtmlEntities } from "@/lib/utils";
import { SaveSharedResourceButton } from "@/components/shared-resource-save-button";
import { Tag } from "@/components/ui/tag";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedResourceByToken(token);
  if (!shared) return { title: "Shared resource · KeepYourStack" };
  const title = `${decodeHtmlEntities(shared.title)} · KeepYourStack`;
  return {
    title,
    description: decodeHtmlEntities(shared.description) || undefined,
    // Only Public shares may be indexed. Unlisted links stay out of search
    // results, which is the whole point of the unlisted option.
    robots: shared.visibility === "public" ? { index: true, follow: true } : { index: false, follow: false, nocache: true },
  };
}

export default async function SharedResourcePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedResourceByToken(token);
  if (!shared) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const title = decodeHtmlEntities(shared.title);
  const description = decodeHtmlEntities(shared.description);
  const domain = shared.domain.replace(/^www\./, "");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-wide text-accent">KeepYourStack · Shared resource</p>

      <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border-strong bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">{title}</h1>
          <p className="font-mono text-[12px] text-text-muted">{domain}</p>
        </div>

        {description && <p className="text-[14px] leading-6 text-text-secondary">{description}</p>}

        {shared.message && (
          <blockquote className="rounded-[var(--radius-md)] border-l-2 border-accent bg-accent-soft px-4 py-3 text-[13.5px] italic text-text-primary">
            &ldquo;{shared.message}&rdquo;
          </blockquote>
        )}

        {shared.tagNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {shared.tagNames.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href={shared.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border-strong px-3.5 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-hover"
          >
            <ExternalLink size={14} /> Open resource
          </a>
        </div>
      </article>

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
        {user ? (
          <SaveSharedResourceButton token={token} />
        ) : (
          <>
            <p className="text-[13.5px] text-text-secondary">
              Save this into your own KeepYourStack library to keep it, tag it, and organize it with your stacks.
            </p>
            <Link
              href={`/auth/login?next=${encodeURIComponent(`/r/${token}`)}`}
              className="inline-flex w-fit items-center rounded-[var(--radius-md)] bg-accent px-4 py-2 text-[13.5px] font-medium text-white hover:bg-accent-hover"
            >
              Sign in to save to My Stack
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
