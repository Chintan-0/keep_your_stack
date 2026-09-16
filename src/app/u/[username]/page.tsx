import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { getPublicProfile, getPublicStacksForUser } from "@/lib/data/public-stacks";
import { getServiceRoleClient } from "@/lib/data/service-role";
import { trackEvent } from "@/lib/data/analytics";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username).catch(() => null);
  if (!profile) return { title: "Profile not found · KeepYourStack" };
  const title = `${profile.name ?? `@${profile.username}`} · KeepYourStack`;
  return { title, openGraph: { title, siteName: "KeepYourStack" }, twitter: { card: "summary", title } };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  const service = getServiceRoleClient();
  const { data: row } = await service.from("profiles").select("id").ilike("username", username).maybeSingle();
  const stacks = row ? await getPublicStacksForUser(row.id) : [];

  void trackEvent({ eventType: "public_profile_view", path: `/@${profile.username}` });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{profile.name ?? `@${profile.username}`}</h1>
        <p className="text-[13px] text-text-secondary">@{profile.username} · Developer toolbox on KeepYourStack</p>
      </div>

      {stacks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-10 text-center">
          <Package size={20} className="text-text-muted" />
          <p className="text-[13.5px] text-text-secondary">No public stacks yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stacks.map((s) => (
            <Link
              key={s.id}
              href={`/@${profile.username}/${s.slug}`}
              className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="text-[22px]">{s.icon}</span>
              <h2 className="text-[15px] font-semibold text-text-primary">{s.name}</h2>
              {s.description && <p className="line-clamp-2 text-[13px] text-text-secondary">{s.description}</p>}
              <p className="mt-auto font-mono text-[11.5px] text-text-muted">{s.resourceCount} resources</p>
            </Link>
          ))}
        </div>
      )}

      <p className="text-center text-[12px] text-text-muted">
        Powered by <span className="font-medium text-text-secondary">KeepYourStack</span>
      </p>
    </div>
  );
}
