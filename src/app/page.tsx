import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Homepage } from "@/components/marketing/homepage";

export const metadata: Metadata = {
  title: "KeepYourStack — Your personal toolbox for building on the internet",
  description:
    "Save, organize, and find the developer tools, docs, APIs, references, and resources you actually use.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "KeepYourStack — Your personal toolbox for building on the internet",
    description:
      "Save, organize, and find the developer tools, docs, APIs, references, and resources you actually use.",
    url: "/",
    siteName: "KeepYourStack",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KeepYourStack — Your personal toolbox for building on the internet",
    description:
      "Save, organize, and find the developer tools, docs, APIs, references, and resources you actually use.",
  },
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in visitors go straight to their library — the marketing
  // homepage isn't a useful landing page for them (see middleware.ts,
  // which lets an authenticated request through to "/" so this check can
  // run and decide, rather than gating "/" outright).
  if (user) redirect("/home");

  return <Homepage />;
}
