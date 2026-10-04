import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Pricing, Platform } from "@/lib/types";
import { getServiceRoleClient } from "./service-role";
import { getResource, createResource } from "./resources";
import { listTags } from "./tags";
import { NotFoundError } from "./errors";

type Client = SupabaseClient<Database>;

function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DROP_HOURLY_LIMIT = positiveIntFromEnv("DROP_HOURLY_LIMIT", 20);
const HOUR_MS = 60 * 60 * 1000;

export class DropError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const RECIPIENT_DROP_COLUMNS =
  "id, status, created_at, responded_at, title, url, domain, description, tag_names, pricing, platform, message";

export interface DropSummary {
  id: string;
  status: "pending" | "saved" | "dismissed";
  createdAt: string;
  respondedAt: string | null;
}

/** Same outward result whether or not the address has an account, so the endpoint can't be used to find out who has one. */
export const DROP_ACCEPTED_MESSAGE = "If that email belongs to a KeepYourStack account, your drop is on its way.";

export interface ReceivedDrop extends DropSummary {
  title: string;
  url: string;
  domain: string;
  description: string;
  tagNames: string[];
  pricing: Pricing | null;
  platform: Platform[];
  message: string;
}

export interface SentDrop extends DropSummary {
  title: string;
  domain: string;
  message: string;
}

function mapSummary(row: { id: string; status: string; created_at: string; responded_at: string | null }): DropSummary {
  return {
    id: row.id,
    status: row.status as DropSummary["status"],
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

/**
 * The recipient is matched by exact (case-insensitive) email on the server; the address is never written to the drop or returned.
 * Unknown addresses and self-drops are accepted without creating anything, so the caller can't tell them apart from a real send.
 */
export async function sendResourceDrop(
  client: Client,
  senderId: string,
  resourceId: string,
  request: { email: string; message: string }
): Promise<void> {
  const resource = await getResource(client, senderId, resourceId);
  if (!resource) throw new NotFoundError("Resource not found.");

  const tags = await listTags(client, senderId);
  const tagNames = resource.tagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter((name): name is string => !!name);

  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const service = getServiceRoleClient();
  const { data: recent, error: countError } = await service
    .from("resource_drops")
    .select("id")
    .eq("sender_id", senderId)
    .gte("created_at", since)
    .limit(DROP_HOURLY_LIMIT);
  if (countError) throw new Error(countError.message);
  if ((recent ?? []).length >= DROP_HOURLY_LIMIT) {
    throw new DropError("You've sent a lot of drops recently. Try again later.", 429);
  }

  const escaped = request.email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: recipient, error: lookupError } = await getServiceRoleClient()
    .from("profiles")
    .select("id")
    .ilike("email", escaped)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!recipient || recipient.id === senderId) return;

  const { error } = await service
    .from("resource_drops")
    .insert({
      sender_id: senderId,
      recipient_id: recipient.id,
      resource_id: resource.id,
      title: resource.title,
      url: resource.url,
      domain: resource.domain,
      description: resource.description,
      tag_names: tagNames,
      pricing: resource.pricing,
      platform: resource.platform ?? [],
      message: request.message,
    });
  if (error) throw new Error(error.message);
}

/** Received drops include the snapshot the sender chose; sent drops show only what the sender needs (no recipient identity). */
export async function listDrops(client: Client, userId: string) {
  const service = getServiceRoleClient();
  const [received, sent] = await Promise.all([
    service
      .from("resource_drops")
      .select(RECIPIENT_DROP_COLUMNS)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("resource_drops")
      .select("id, status, created_at, responded_at, title, domain, message")
      .eq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (received.error) throw new Error(received.error.message);
  if (sent.error) throw new Error(sent.error.message);

  return {
    received: (received.data ?? []).map(
      (row): ReceivedDrop => ({
        ...mapSummary(row),
        title: row.title,
        url: row.url,
        domain: row.domain,
        description: row.description,
        tagNames: row.tag_names,
        pricing: (row.pricing as Pricing | null) ?? null,
        platform: (row.platform as Platform[]) ?? [],
        message: row.message,
      })
    ),
    sent: (sent.data ?? []).map(
      (row): SentDrop => ({
        ...mapSummary(row),
        title: row.title,
        domain: row.domain,
        message: row.message,
      })
    ),
  };
}

async function getPendingReceivedDrop(userId: string, dropId: string) {
  const { data, error } = await getServiceRoleClient()
    .from("resource_drops")
    .select(RECIPIENT_DROP_COLUMNS)
    .eq("id", dropId)
    .eq("recipient_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Drop not found or already answered.");
  return data;
}

/** Saves the drop into the recipient's own library. The response is recorded only after the copy succeeds. */
export async function saveDrop(client: Client, userId: string, dropId: string) {
  const drop = await getPendingReceivedDrop(userId, dropId);
  const result = await createResource(client, userId, {
    url: drop.url,
    title: drop.title,
    description: drop.description,
    tagNames: drop.tag_names,
    pricing: (drop.pricing as Pricing | null) ?? null,
    platform: (drop.platform as Platform[]) ?? [],
  });
  const { error } = await getServiceRoleClient()
    .from("resource_drops")
    .update({ status: "saved", responded_at: new Date().toISOString() })
    .eq("id", dropId)
    .eq("recipient_id", userId);
  if (error) throw new Error(error.message);
  return result;
}

export async function dismissDrop(client: Client, userId: string, dropId: string): Promise<void> {
  await getPendingReceivedDrop(userId, dropId);
  const { error } = await getServiceRoleClient()
    .from("resource_drops")
    .update({ status: "dismissed", responded_at: new Date().toISOString() })
    .eq("id", dropId)
    .eq("recipient_id", userId);
  if (error) throw new Error(error.message);
}
