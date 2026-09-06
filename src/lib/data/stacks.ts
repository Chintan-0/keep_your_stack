import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Stack } from "@/lib/types";
import { mapStackRow } from "./mappers";

type Client = SupabaseClient<Database>;

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
  const { data, error } = await client
    .from("stacks")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      description: input.description.trim(),
      icon: input.icon || "📦",
      color: input.color || "accent",
    })
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
  const { data, error } = await client
    .from("stacks")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapStackRow(data);
}

export async function deleteStack(client: Client, userId: string, id: string): Promise<void> {
  const { error } = await client.from("stacks").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
