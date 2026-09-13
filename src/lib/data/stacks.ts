import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Stack } from "@/lib/types";
import { mapStackRow } from "./mappers";
import { NotFoundError } from "./errors";

type Client = SupabaseClient<Database>;

export { NotFoundError };

async function getOwnStack(client: Client, userId: string, id: string) {
  const { data, error } = await client.from("stacks").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapStackRow(data) : null;
}

const MAX_STACK_NAME_LENGTH = 60;
const MAX_STACK_DESCRIPTION_LENGTH = 500;
const MAX_STACK_ICON_LENGTH = 8; // generous for a multi-codepoint emoji, nowhere near enough to matter as a payload

function clampStackFields(input: { name: string; description: string; icon: string; color: string }) {
  const name = input.name.trim().slice(0, MAX_STACK_NAME_LENGTH);
  if (!name) throw new Error("Give it a name first.");
  return {
    name,
    description: input.description.trim().slice(0, MAX_STACK_DESCRIPTION_LENGTH),
    icon: (input.icon || "📦").slice(0, MAX_STACK_ICON_LENGTH),
    color: input.color || "accent",
  };
}

export async function listStacks(client: Client, userId: string): Promise<Stack[]> {
  const { data, error } = await client
    .from("stacks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapStackRow);
}

export async function createStack(
  client: Client,
  userId: string,
  input: { name: string; description: string; icon: string; color: string }
): Promise<Stack> {
  const clamped = clampStackFields(input);
  const { data, error } = await client
    .from("stacks")
    .insert({ user_id: userId, ...clamped })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapStackRow(data);
}

export async function updateStack(
  client: Client,
  userId: string,
  id: string,
  patch: Partial<{ name: string; description: string; icon: string; color: string }>
): Promise<Stack> {
  const current = await getOwnStack(client, userId, id);
  if (!current) throw new NotFoundError("Stack not found.");

  const clamped: Partial<{ name: string; description: string; icon: string; color: string }> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, MAX_STACK_NAME_LENGTH);
    if (!name) throw new Error("Give it a name first.");
    clamped.name = name;
  }
  if (patch.description !== undefined) clamped.description = patch.description.trim().slice(0, MAX_STACK_DESCRIPTION_LENGTH);
  if (patch.icon !== undefined) clamped.icon = (patch.icon || "📦").slice(0, MAX_STACK_ICON_LENGTH);
  if (patch.color !== undefined) clamped.color = patch.color || "accent";

  const { data, error } = await client
    .from("stacks")
    .update(clamped)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Stack not found.");
  return mapStackRow(data);
}

export async function deleteStack(client: Client, userId: string, id: string): Promise<void> {
  const { data, error } = await client.from("stacks").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new NotFoundError("Stack not found.");
}
