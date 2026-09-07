// Creates (or reuses) a fixed local-only account so the login page can
// auto-sign-in during development — see DEV_USER in
// src/app/auth/login/page.tsx. Run after every `supabase db reset`
// (db reset wipes auth.users along with everything else).
//
//   node scripts/create-dev-user.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DEV_EMAIL = "dev@keepyourstack.local";
const DEV_PASSWORD = "devpassword123";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing } = await admin.auth.admin.listUsers();
const already = existing?.users?.find((u) => u.email === DEV_EMAIL);

if (already) {
  console.log(`Dev user already exists: ${DEV_EMAIL}`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Dev User" },
  });
  if (error) {
    console.error("Failed to create dev user:", error.message);
    process.exit(1);
  }
  console.log(`Created dev user: ${DEV_EMAIL} / ${DEV_PASSWORD}`);
}
