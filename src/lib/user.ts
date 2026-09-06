// This app is currently single-user/local-only — no auth, no backend.
// Everything that will eventually need a real authenticated user id reads
// it from here instead of hardcoding "local-user" inline, so wiring up
// real auth later is a one-file change: replace this constant (and
// DEMO_USER, for display) with whatever the auth layer provides.
export const CURRENT_USER_ID = "local-user";

export const DEMO_USER = {
  name: "Demo User",
  tagline: "KeepYourStack user",
};
