/**
 * An id that doesn't exist, or isn't the caller's own (RLS/the explicit
 * `.eq("user_id", ...)` filter make those indistinguishable at the query
 * level, which is correct — it never leaks *which* case it is to another
 * user). API routes map this to a 404, not the generic 500 every other
 * unexpected error gets.
 */
export class NotFoundError extends Error {}
