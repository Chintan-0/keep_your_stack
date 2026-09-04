"use client";

import { useState } from "react";

// Captures a timestamp once (via useState's lazy initializer, which React
// treats as a one-time impure escape hatch) so components can compute
// "how long ago" without calling Date.now() directly during render.
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
