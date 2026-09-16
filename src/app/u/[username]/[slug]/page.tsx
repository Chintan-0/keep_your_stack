import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicStackBySlug } from "@/lib/data/public-stacks";
import { trackEvent } from "@/lib/data/analytics";
import { PublicStackView } from "@/components/public/public-stack-view";

// Actual URL is /@username/slug — see next.config.ts's rewrite. Server
// component: fetches directly from the data layer (not via an internal
// fetch to our own API) for the initial render, tracks the view
// server-side (real, not client-guessable), and only the interactive
// bits (search, save) are client-side.
export async function generateMetadata({ params }: { params: Promise<{ username: string; slug: string }> }): Promise<Metadata> {
  const { username, slug } = await params;
  const stack = await getPublicStackBySlug(username, slug).catch(() => null);
  if (!stack) return { title: "Stack not found · KeepYourStack" };
  const title = `${stack.ownerName ? `${stack.ownerName}'s ` : ""}${stack.name} · KeepYourStack`;
  const description = stack.description || `${stack.resources.length} resources · KeepYourStack`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "KeepYourStack" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicStackPage({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  const stack = await getPublicStackBySlug(username, slug);
  if (!stack) notFound();

  void trackEvent({ eventType: "public_stack_view", path: `/@${username}/${slug}`, metadata: { stackId: stack.id } });

  return <PublicStackView stack={stack} cloneUrl={`/api/public/stack/${username}/${slug}/clone`} />;
}
