import type { Booking } from "@/context/BookingContext";

export function buildRepeatBookingParams(booking: Booking) {
  return {
    providerId: booking.providerId || undefined,
    providerName: booking.providerName || undefined,
    providerRate: booking.ratePerHour ? String(booking.ratePerHour) : undefined,
    serviceName: booking.service || undefined,
    prefillAddress: booking.address || undefined,
    prefillDescription: booking.description || undefined,
    previousBookingId: booking.id,
  };
}
