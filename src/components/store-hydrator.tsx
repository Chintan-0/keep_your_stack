"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Kicks off the one-time fetch of the signed-in user's data on mount. */
export function StoreHydrator() {
  useEffect(() => {
    void useStore.getState().hydrate();
  }, []);
  return null;
}
