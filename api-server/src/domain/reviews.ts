import crypto from "crypto";
import { db } from "@workspace/db";
import { bookingsTable, reviewsTable, usersTable } from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export class ReviewSubmissionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function submitBookingReview(input: {
  bookingId: string;
  customerId: string;
  rating: number;
  review?: string | null;
}) {
  const rating = Number(input.rating);
  const review = String(input.review || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ReviewSubmissionError(400, "Rating must be an integer between 1 and 5");
  }
  if (review.length > 500) {
    throw new ReviewSubmissionError(400, "Review must be 500 characters or fewer");
  }

  return db.transaction(async (tx) => {
    const booking = await tx.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, input.bookingId) });
    if (!booking) throw new ReviewSubmissionError(404, "Booking not found");
    if (booking.customerId !== input.customerId) {
      throw new ReviewSubmissionError(403, "Only the booking customer can submit a review");
    }
    if (booking.status !== "completed") {
      throw new ReviewSubmissionError(400, "Only completed bookings can be reviewed");
    }

    const updatedRows = await tx
      .update(bookingsTable)
      .set({ rating, review: review || null, updatedAt: new Date() })
      .where(and(
        eq(bookingsTable.id, input.bookingId),
        eq(bookingsTable.customerId, input.customerId),
        isNull(bookingsTable.rating),
      ))
      .returning();

    if (updatedRows.length === 0) {
      throw new ReviewSubmissionError(409, "This booking has already been reviewed");
    }
    const updated = updatedRows[0];

    await tx.insert(reviewsTable).values({
      id: crypto.randomUUID(),
      bookingId: updated.id,
      reviewerId: updated.customerId,
      reviewerName: updated.customerName,
      reviewedId: updated.providerId,
      reviewedName: updated.providerName,
      rating,
      review: review || null,
      updatedAt: new Date(),
    }).onConflictDoNothing({ target: reviewsTable.bookingId });

    const [summary] = await tx
      .select({
        average: sql<number>`round(avg(${reviewsTable.rating})::numeric, 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewsTable)
      .where(and(eq(reviewsTable.reviewedId, updated.providerId), eq(reviewsTable.isDisputed, false)));

    await tx.update(usersTable).set({
      rating: Number(summary?.average || 0),
      ratingCount: Number(summary?.count || 0),
    }).where(eq(usersTable.id, updated.providerId));

    return updated;
  });
}
