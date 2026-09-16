import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getServiceRoleClient } from "./service-role";
import type { Pricing, Platform } from "@/lib/types";

type Client = SupabaseClient<Database>;

// Everything here is read by anonymous visitors — every function is
// explicit about exactly which columns it selects (never `select("*")` on
// a resource/profile), so a private field can't leak just because a
// query was written loosely. Uses the service-role client (RLS's own
// "select public"/"select via public stack" policies would also allow
// these same reads — see the migration — but going through the app layer
// here keeps the "only public stuff, only these columns" contract
// explicit and in one place, the same pattern already used for admin
// analytics).

export interface PublicProfile {
  username: string;
  name: string | null;
}

export interface PublicStackSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  slug: string;
  resourceCount: number;
}

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, name, username")
    .ilike("username", username)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.username) return null;
  return { username: data.username, name: data.name };
}

export async function getPublicStacksForUser(userId: string): Promise<PublicStackSummary[]> {
  const client = getServiceRoleClient();
  const { data: stacks, error } = await client
    .from("stacks")
    .select("id, name, description, icon, color, slug")
    .eq("user_id", userId)
    .eq("visibility", "public")
    .not("slug", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!stacks || stacks.length === 0) return [];

  const stackIds = stacks.map((s) => s.id);
  const { data: links, error: linkError } = await client.from("resource_stacks").select("stack_id").in("stack_id", stackIds);
  if (linkError) throw new Error(linkError.message);
  const countByStack = new Map<string, number>();
  for (const l of links ?? []) countByStack.set(l.stack_id, (countByStack.get(l.stack_id) ?? 0) + 1);

  return stacks.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    icon: s.icon,
    color: s.color,
    slug: s.slug as string,
    resourceCount: countByStack.get(s.id) ?? 0,
  }));
}

export interface PublicResource {
  id: string;
  title: string;
  url: string;
  description: string;
  useCases: string[];
  categoryName: string | null;
  tags: string[];
  pricing: Pricing | null;
  platform: Platform[];
}

export interface PublicStackDetail {
  id: string;
  ownerUsername: string;
  ownerName: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  slug: string;
  visibility: "public" | "unlisted";
  resources: PublicResource[];
}

async function loadStackResources(client: Client, stackId: string): Promise<PublicResource[]> {
  const { data: links, error: linkError } = await client
    .from("resource_stacks")
    .select("resource_id")
    .eq("stack_id", stackId);
  if (linkError) throw new Error(linkError.message);
  const resourceIds = (links ?? []).map((l) => l.resource_id);
  if (resourceIds.length === 0) return [];

  // Explicit column list — never notes, never import provenance, never
  // internal enrichment bookkeeping. This is the one place that decides
  // what a public visitor can see of a resource.
  const { data: resources, error } = await client
    .from("resources")
    .select("id, title, url, description, use_cases, category_id, pricing, platform, is_archived")
    .in("id", resourceIds)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = resources ?? [];
  if (rows.length === 0) return [];

  const categoryIds = Array.from(new Set(rows.map((r) => r.category_id).filter((id): id is string => !!id)));
  const { data: categories } = categoryIds.length
    ? await client.from("categories").select("id, name").in("id", categoryIds)
    : { data: [] as { id: string; name: string }[] };
  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const { data: tagLinks } = await client.from("resource_tags").select("resource_id, tag_id").in("resource_id", rows.map((r) => r.id));
  const tagIds = Array.from(new Set((tagLinks ?? []).map((t) => t.tag_id)));
  const { data: tags } = tagIds.length ? await client.from("tags").select("id, name").in("id", tagIds) : { data: [] as { id: string; name: string }[] };
  const tagNameById = new Map((tags ?? []).map((t) => [t.id, t.name]));
  const tagIdsByResource = new Map<string, string[]>();
  for (const link of tagLinks ?? []) {
    const list = tagIdsByResource.get(link.resource_id) ?? [];
    list.push(link.tag_id);
    tagIdsByResource.set(link.resource_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    description: r.description,
    useCases: r.use_cases,
    categoryName: r.category_id ? (categoryNameById.get(r.category_id) ?? null) : null,
    tags: (tagIdsByResource.get(r.id) ?? []).map((id) => tagNameById.get(id)).filter((n): n is string => !!n),
    pricing: r.pricing as Pricing | null,
    platform: (r.platform ?? []) as Platform[],
  }));
}

export async function getPublicStackBySlug(username: string, slug: string): Promise<PublicStackDetail | null> {
  const client = getServiceRoleClient();
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, name, username")
    .ilike("username", username)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile || !profile.username) return null;

  const { data: stack, error } = await client
    .from("stacks")
    .select("id, name, description, icon, color, slug, visibility")
    .eq("user_id", profile.id)
    .eq("slug", slug)
    .eq("visibility", "public")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!stack) return null;

  const resources = await loadStackResources(client, stack.id);
  return {
    id: stack.id,
    ownerUsername: profile.username,
    ownerName: profile.name,
    name: stack.name,
    description: stack.description,
    icon: stack.icon,
    color: stack.color,
    slug: stack.slug as string,
    visibility: "public",
    resources,
  };
}

/** Unlisted access — the token IS the authorization; a valid, non-revoked token is sufficient (no username/slug needed in the URL at all, matching Part H's /share/<token> route). */
export async function getStackByShareToken(token: string): Promise<PublicStackDetail | null> {
  if (!token || token.length < 20) return null; // cheap guard against obviously-malformed input before a DB round trip
  const client = getServiceRoleClient();
  const { data: link, error: linkError } = await client
    .from("stack_share_links")
    .select("stack_id, revoked_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link) return null;

  const { data: stack, error } = await client
    .from("stacks")
    .select("id, user_id, name, description, icon, color, slug, visibility")
    .eq("id", link.stack_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // The owner may have since switched back to private — the link row
  // itself gets revoked when that happens (see setStackVisibility), so
  // this check is redundant defense-in-depth, not the only guard.
  if (!stack || stack.visibility === "private") return null;

  const { data: profile } = await client.from("profiles").select("name, username").eq("id", stack.user_id).maybeSingle();

  const resources = await loadStackResources(client, stack.id);
  return {
    id: stack.id,
    ownerUsername: profile?.username ?? "",
    ownerName: profile?.name ?? null,
    name: stack.name,
    description: stack.description,
    icon: stack.icon,
    color: stack.color,
    slug: stack.slug ?? "",
    visibility: stack.visibility === "public" ? "public" : "unlisted",
    resources,
  };
}
