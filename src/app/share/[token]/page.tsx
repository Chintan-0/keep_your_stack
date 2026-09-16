import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStackByShareToken } from "@/lib/data/public-stacks";
import { trackEvent } from "@/lib/data/analytics";
import { PublicStackView } from "@/components/public/public-stack-view";

// Unlisted (Part H) — no username/slug in the URL at all, just the
// token. Deliberately noindex/nofollow (Part N: "should use appropriate
// indexing controls to discourage search engine indexing") — an unlisted
// link being crawlable and appearing in search results would defeat the
// entire point of "only people with the exact link can see it."
export const metadata: Metadata = {
  title: "Shared Stack · KeepYourStack",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedStackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const stack = await getStackByShareToken(token);
  if (!stack) notFound();

  void trackEvent({ eventType: "public_stack_view", path: `/share/${token}`, metadata: { stackId: stack.id, via: "unlisted" } });

  return <PublicStackView stack={stack} cloneUrl={`/api/public/share/${token}/clone`} />;
}
