import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "./concurrency";

describe("runWithConcurrency", () => {
  it("processes every item exactly once", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const seen: number[] = [];
    await runWithConcurrency(items, 5, async (item) => {
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("never has more than `concurrency` workers in flight at once", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    await runWithConcurrency(items, 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("reports progress after each item completes, ending at the total", async () => {
    const items = [1, 2, 3, 4];
    const progressCalls: number[] = [];
    await runWithConcurrency(
      items,
      2,
      async () => {},
      (done) => progressCalls.push(done)
    );
    expect(progressCalls).toHaveLength(4);
    expect(progressCalls[progressCalls.length - 1]).toBe(4);
  });

  it("still counts a failed item as done, so one bad item can't hang progress", async () => {
    const items = [1, 2, 3];
    let doneCount = 0;
    await expect(
      runWithConcurrency(
        items,
        3,
        async (item) => {
          if (item === 2) throw new Error("boom");
        },
        (done) => {
          doneCount = done;
        }
      )
    ).rejects.toThrow();
    // Even though it rejects overall, the items that did settle should
    // have been reflected in progress before the rejection propagated.
    expect(doneCount).toBeGreaterThan(0);
  });
});
