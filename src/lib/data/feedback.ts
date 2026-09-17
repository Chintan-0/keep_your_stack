import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { FeedbackCategory } from "@/lib/feedback-validation";

export type { FeedbackCategory } from "@/lib/feedback-validation";
export { isFeedbackCategory } from "@/lib/feedback-validation";

type Client = SupabaseClient<Database>;

export interface FeedbackContext {
  route?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  appVersion?: string;
}

/**
 * Submits one feedback row. `context` is built by the API route from a
 * fixed allowlist of safe, auto-collectable technical fields (§24) — never
 * arbitrary client data, never a password/token/private resource content.
 * There is no read path for a regular user by design (see the migration's
 * RLS comment) — this is a one-way mailbox, not a support-ticket viewer.
 */
export async function submitFeedback(
  client: Client,
  userId: string,
  input: { category: FeedbackCategory; message: string; context: FeedbackContext }
): Promise<void> {
  const { error } = await client.from("feedback").insert({
    user_id: userId,
    category: input.category,
    message: input.message.trim().slice(0, 2000),
    context: { ...input.context },
  });
  if (error) throw new Error(error.message);
}
