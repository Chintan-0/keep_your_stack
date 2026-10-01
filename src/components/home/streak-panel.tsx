import type { Resource } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Every real calendar day (local time) that has at least one resource with that createdAt, computed from the data actually loaded — never simulated. */
function activeDayKeys(resources: Resource[]): Set<string> {
  return new Set(resources.map((r) => localDayKey(new Date(r.createdAt))));
}

/** Consecutive days of activity ending today — 0 the moment today itself has nothing yet, same as any real streak counter. */
function computeStreak(activeDays: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  while (activeDays.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function StreakPanel({ resources }: { resources: Resource[] }) {
  const activeDays = activeDayKeys(resources);
  const streak = computeStreak(activeDays);

  // The current Mon–Sun week, local time.
  const today = new Date();
  const isoWeekday = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - isoWeekday);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label: DAY_LABELS[i], active: activeDays.has(localDayKey(d)), isToday: localDayKey(d) === localDayKey(today) };
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-gradient-to-br from-orange-soft to-transparent p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg">
            🔥
          </span>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">{streak} day{streak === 1 ? "" : "s"}</p>
            <p className="text-[11px] text-text-secondary">{streak > 0 ? "Keep organizing!" : "Add something today to start a streak"}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        {week.map((d) => (
          <div key={d.label} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold",
                d.active
                  ? "bg-orange text-white"
                  : d.isToday
                    ? "border border-border-strong text-text-secondary"
                    : "bg-surface-3 text-text-muted"
              )}
            >
              {d.label.charAt(0)}
            </span>
            <span className="text-[9px] text-text-muted">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
