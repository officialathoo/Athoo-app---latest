import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1O makes booking-detail loading and unavailable states truthful", () => {
  const screen = read("athoo-app/app/(customer)/booking-detail.tsx");

  assert.match(screen, /isLoading: bookingsLoading/);
  assert.match(screen, /const \[bookingLoadAttempted, setBookingLoadAttempted\] = useState\(false\)/);
  assert.match(screen, /const \[bookingRetrying, setBookingRetrying\] = useState\(false\)/);
  assert.match(screen, /const stillLoading = bookingsLoading \|\| !bookingLoadAttempted/);
  assert.match(screen, /Loading booking\.\.\./);
  assert.match(screen, /Booking unavailable/);
  assert.match(screen, /customer-booking-detail-retry/);
  assert.doesNotMatch(screen, /<Text>Loading\.\.\.<\/Text>/);
});

test("Phase 30.1O preserves conservative detail polling and delegates overlap protection to BookingContext", () => {
  const screen = read("athoo-app/app/(customer)/booking-detail.tsx");
  const context = read("athoo-app/context/BookingContext.tsx");

  assert.match(screen, /setInterval\(tick, 30_000\)/);
  assert.match(screen, /AppState\.addEventListener/);
  assert.match(screen, /void refreshBooking\("background"\)/);
  assert.match(screen, /void refreshBooking\("retry"\)/);
  assert.match(context, /const loadInFlightRef = useRef\(false\)/);
  assert.match(context, /if \(loadInFlightRef\.current\) return/);
  assert.match(context, /loadInFlightRef\.current = true/);
  assert.match(context, /loadInFlightRef\.current = false/);
});

test("Phase 30.1O preserves booking actions, realtime location, chat and calls", () => {
  const screen = read("athoo-app/app/(customer)/booking-detail.tsx");

  assert.match(screen, /api\.markBookingPaid/);
  assert.match(screen, /api\.updateCustomerLocation/);
  assert.match(screen, /realtime\.on/);
  assert.match(screen, /booking:location/);
  assert.match(screen, /getOrCreateChat/);
  assert.match(screen, /startOutgoingCall/);
  assert.match(screen, /rateBooking/);
  assert.match(screen, /updateBookingStatus/);
});