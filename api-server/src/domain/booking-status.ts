export const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATE_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function canTransitionBookingStatus(
  from: string | null | undefined,
  to: BookingStatus,
): boolean {
  const current = from ?? "pending";
  if (!isBookingStatus(current)) return false;
  return BOOKING_STATE_TRANSITIONS[current].includes(to);
}

export function assertBookingStatusTransition(
  from: string | null | undefined,
  to: BookingStatus,
): void {
  if (!canTransitionBookingStatus(from, to)) {
    throw new Error(`Invalid booking transition: '${from ?? "pending"}' -> '${to}'`);
  }
}
