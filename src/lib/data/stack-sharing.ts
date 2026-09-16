import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Stack, StackVisibility } from "@/lib/types";
import { mapStackRow } from "./mappers";
import { slugify } from "@/lib/utils";
import { NotFoundError } from "./errors";

type Client = SupabaseClient<Database>;

export { NotFoundError };

/** 32 random bytes, base64url-encoded (~43 chars) — cryptographically random, never a sequential id, a user id, a timestamp, or an encoded database id. See Part H's explicit requirement. */
function generateShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

async function getOwnStack(client: Client, userId: string, id: string) {
  const { data, error } = await client.from("stacks").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapStackRow(data) : null;
}

/** A unique-per-user slug derived from the stack's name, disambiguated with a numeric suffix on collision (never a database id). */
async function ensureUniqueSlug(client: Client, userId: string, stackId: string, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await client
      .from("stacks")
      .select("id")
      .eq("user_id", userId)
      .eq("slug", candidate)
      .neq("id", stackId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
  }
  // Astronomically unlikely (50 collisions on one user's own stacks) — fall back to a random suffix rather than looping forever.
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

export interface VisibilityChangeResult {
  stack: Stack;
  shareToken: string | null;
}

/**
 * Changes a stack's visibility. Assigns a slug the first time a stack
 * becomes public/unlisted (kept afterward even if later made private
 * again, so re-sharing doesn't change the URL). Making a stack UNLISTED
 * mints a fresh share token unless one is already active. Making it
 * PRIVATE revokes every active share link immediately — Part G/H's
 * explicit "old access must immediately stop working" requirement.
 */
export async function setStackVisibility(
  client: Client,
  userId: string,
  stackId: string,
  visibility: StackVisibility
): Promise<VisibilityChangeResult> {
  const current = await getOwnStack(client, userId, stackId);
  if (!current) throw new NotFoundError("Stack not found.");

  let slug = current.slug;
  if (!slug && visibility !== "private") {
    slug = await ensureUniqueSlug(client, userId, stackId, current.name);
  }

  const { data, error } = await client
    .from("stacks")
    .update({ visibility, ...(slug !== current.slug ? { slug } : {}) })
    .eq("id", stackId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Stack not found.");

  if (visibility === "private") {
    const { error: revokeError } = await client
      .from("stack_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("stack_id", stackId)
      .is("revoked_at", null);
    if (revokeError) throw new Error(revokeError.message);
    return { stack: mapStackRow(data), shareToken: null };
  }

  if (visibility === "unlisted") {
    const { data: existingLink, error: linkError } = await client
      .from("stack_share_links")
      .select("token")
      .eq("stack_id", stackId)
      .is("revoked_at", null)
      .maybeSingle();
    if (linkError) throw new Error(linkError.message);
    if (existingLink) return { stack: mapStackRow(data), shareToken: existingLink.token };

    const token = generateShareToken();
    const { error: insertError } = await client.from("stack_share_links").insert({ stack_id: stackId, token });
    if (insertError) throw new Error(insertError.message);
    return { stack: mapStackRow(data), shareToken: token };
  }

  // public: no token needed (Part C's URL is /@username/slug, not a
  // secret), but any previously-issued unlisted token is left alone —
  // it still resolves to the same (now-public) stack, which is harmless.
  return { stack: mapStackRow(data), shareToken: null };
}

/** Regenerates an unlisted stack's share token — the previous one stops working immediately (Part H). No-ops (throws) if the stack isn't currently unlisted. */
export async function regenerateShareLink(client: Client, userId: string, stackId: string): Promise<string> {
  const current = await getOwnStack(client, userId, stackId);
  if (!current) throw new NotFoundError("Stack not found.");
  if (current.visibility !== "unlisted") {
    throw new Error("Only an unlisted stack has a share link to regenerate.");
  }

  const { error: revokeError } = await client
    .from("stack_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("stack_id", stackId)
    .is("revoked_at", null);
  if (revokeError) throw new Error(revokeError.message);

  const token = generateShareToken();
  const { error: insertError } = await client.from("stack_share_links").insert({ stack_id: stackId, token });
  if (insertError) throw new Error(insertError.message);
  return token;
}
