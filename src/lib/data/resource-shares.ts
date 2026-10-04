import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Pricing, Platform } from "@/lib/types";
import type { ShareVisibility } from "@/lib/resource-share-validation";
import { getServiceRoleClient } from "./service-role";
import { getResource, createResource } from "./resources";
import { listTags } from "./tags";
import { NotFoundError } from "./errors";

type Client = SupabaseClient<Database>;

export interface ResourceShare {
  id: string;
  resourceId: string;
  token: string;
  visibility: ShareVisibility;
  message: string;
  createdAt: string;
}

export interface SharedResource {
  title: string;
  url: string;
  domain: string;
  description: string;
  tagNames: string[];
  pricing: Pricing | null;
  platform: Platform[];
  message: string;
  visibility: ShareVisibility;
  createdAt: string;
}

const TOKEN_MIN_LENGTH = 20;

function generateShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function mapShareRow(row: Database["public"]["Tables"]["resource_shares"]["Row"]): ResourceShare {
  return {
    id: row.id,
    resourceId: row.resource_id,
    token: row.token,
    visibility: row.visibility,
    message: row.message,
    createdAt: row.created_at,
  };
}

/** Snapshots the resource's public fields into the share row, so later edits to the owner's resource never change what a link shows. */
export async function createResourceShare(
  client: Client,
  userId: string,
  resourceId: string,
  request: { visibility: ShareVisibility; message: string }
): Promise<ResourceShare> {
  const resource = await getResource(client, userId, resourceId);
  if (!resource) throw new NotFoundError("Resource not found.");

  const tags = await listTags(client, userId);
  const tagNames = resource.tagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter((name): name is string => !!name);

  const { data, error } = await client
    .from("resource_shares")
    .insert({
      user_id: userId,
      resource_id: resource.id,
      token: generateShareToken(),
      visibility: request.visibility,
      message: request.message,
      title: resource.title,
      url: resource.url,
      domain: resource.domain,
      description: resource.description,
      tag_names: tagNames,
      pricing: resource.pricing,
      platform: resource.platform ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapShareRow(data);
}

export async function listActiveResourceShares(
  client: Client,
  userId: string,
  resourceId: string
): Promise<ResourceShare[]> {
  const { data, error } = await client
    .from("resource_shares")
    .select("*")
    .eq("user_id", userId)
    .eq("resource_id", resourceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapShareRow);
}

export async function revokeResourceShare(client: Client, userId: string, shareId: string): Promise<void> {
  const { data, error } = await client
    .from("resource_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Share not found.");
}

/** Public lookup by token. The token is the authorization, so a revoked or unknown token resolves to null. */
export async function getSharedResourceByToken(token: string): Promise<SharedResource | null> {
  if (!token || token.length < TOKEN_MIN_LENGTH) return null;
  const { data, error } = await getServiceRoleClient()
    .from("resource_shares")
    .select("title, url, domain, description, tag_names, pricing, platform, message, visibility, created_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    title: data.title,
    url: data.url,
    domain: data.domain,
    description: data.description,
    tagNames: data.tag_names,
    pricing: (data.pricing as Pricing | null) ?? null,
    platform: (data.platform as Platform[]) ?? [],
    message: data.message,
    visibility: data.visibility,
    createdAt: data.created_at,
  };
}

/** Copies a shared resource into the viewer's own library. Categories and notes aren't carried over: categories belong to the owner, and notes are private. */
export async function saveSharedResource(client: Client, userId: string, token: string) {
  const shared = await getSharedResourceByToken(token);
  if (!shared) return null;
  return createResource(client, userId, {
    url: shared.url,
    title: shared.title,
    description: shared.description,
    tagNames: shared.tagNames,
    pricing: shared.pricing,
    platform: shared.platform,
  });
}
