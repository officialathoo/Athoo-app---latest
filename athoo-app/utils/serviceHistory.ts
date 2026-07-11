import type { Booking } from "@/context/BookingContext";

export interface ServiceHistoryInsight {
  service: string;
  completedCount: number;
  lastCompletedAt: string;
  nextSuggestedAt: string;
  daysUntilSuggested: number;
  latestBooking: Booking;
}

const SERVICE_INTERVAL_DAYS: Array<[RegExp, number]> = [
  [/\b(ac|air conditioner|hvac)\b/i, 180],
  [/\b(pest|termite|fumigation)\b/i, 180],
  [/\b(clean|cleaning|deep clean)\b/i, 90],
  [/\b(plumb|leak|drain)\b/i, 120],
  [/\b(electric|generator|ups)\b/i, 180],
  [/\b(water tank|geyser|heater)\b/i, 180],
  [/\b(paint|polish)\b/i, 365],
];

export function suggestedIntervalDays(service: string): number {
  return SERVICE_INTERVAL_DAYS.find(([pattern]) => pattern.test(service))?.[1] ?? 180;
}

function bookingCompletionDate(booking: Booking): Date | null {
  const raw = booking.jobCompletedAt || booking.updatedAt || booking.createdAt;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildServiceHistoryInsights(bookings: Booking[], now = new Date()): ServiceHistoryInsight[] {
  const completed = bookings.filter((booking) => booking.status === "completed");
  const groups = new Map<string, Booking[]>();

  for (const booking of completed) {
    const key = booking.service.trim().toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(booking);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const sorted = [...group].sort((a, b) => {
        const aDate = bookingCompletionDate(a)?.getTime() ?? 0;
        const bDate = bookingCompletionDate(b)?.getTime() ?? 0;
        return bDate - aDate;
      });
      const latestBooking = sorted[0];
      const completedAt = bookingCompletionDate(latestBooking);
      if (!completedAt) return null;

      const next = new Date(completedAt);
      next.setDate(next.getDate() + suggestedIntervalDays(latestBooking.service));
      const daysUntilSuggested = Math.ceil((next.getTime() - now.getTime()) / 86_400_000);

      return {
        service: latestBooking.service,
        completedCount: group.length,
        lastCompletedAt: completedAt.toISOString(),
        nextSuggestedAt: next.toISOString(),
        daysUntilSuggested,
        latestBooking,
      } satisfies ServiceHistoryInsight;
    })
    .filter((item): item is ServiceHistoryInsight => Boolean(item))
    .sort((a, b) => a.daysUntilSuggested - b.daysUntilSuggested);
}
