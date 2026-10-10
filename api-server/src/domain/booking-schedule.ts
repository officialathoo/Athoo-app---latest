const DEFAULT_TIME_ZONE = "Asia/Karachi";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // Force validation now so an invalid deployment value fails predictably.
  formatter.format(new Date(0));
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function zonedParts(value: Date, timeZone: string): DateTimeParts | null {
  const parts = formatterFor(timeZone).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const result = {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function sameMinute(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

export function getBookingTimeZone(environment: NodeJS.ProcessEnv = process.env): string {
  const timeZone = String(environment.BOOKING_TIME_ZONE || DEFAULT_TIME_ZONE).trim();
  formatterFor(timeZone);
  return timeZone;
}

export function parseScheduledDateTime(
  dateValue: unknown,
  timeValue: unknown,
  timeZone = getBookingTimeZone(),
): Date | null {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = String(timeMatch[3] || "").toUpperCase();

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  const localParts = { year, month, day, hour, minute, second: 0 };
  const calendarCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() + 1 !== month
    || calendarCheck.getUTCDate() !== day) {
    return null;
  }

  // Convert an IANA-zone wall-clock time into an absolute instant. Repeating
  // the offset calculation handles zones whose offset changes near the target.
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instantMs = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const atInstant = zonedParts(new Date(instantMs), timeZone);
    if (!atInstant) return null;
    const representedAsUtc = Date.UTC(
      atInstant.year,
      atInstant.month - 1,
      atInstant.day,
      atInstant.hour,
      atInstant.minute,
      atInstant.second,
    );
    const offsetMs = representedAsUtc - instantMs;
    const corrected = localAsUtc - offsetMs;
    if (corrected === instantMs) break;
    instantMs = corrected;
  }

  const instant = new Date(instantMs);
  const verified = zonedParts(instant, timeZone);
  return verified && sameMinute(verified, localParts) ? instant : null;
}

export function getNoShowEligibleAt(input: {
  scheduledDate: unknown;
  scheduledTime: unknown;
  acceptedOrLastActivityAt?: Date | string | null;
  graceMs: number;
  timeZone?: string;
}): Date | null {
  if (!Number.isFinite(input.graceMs) || input.graceMs < 0) return null;
  const scheduledAt = parseScheduledDateTime(
    input.scheduledDate,
    input.scheduledTime,
    input.timeZone || getBookingTimeZone(),
  );
  if (!scheduledAt) return null;

  const activityAt = input.acceptedOrLastActivityAt
    ? new Date(input.acceptedOrLastActivityAt)
    : null;
  const activityMs = activityAt && Number.isFinite(activityAt.getTime())
    ? activityAt.getTime()
    : scheduledAt.getTime();
  return new Date(Math.max(scheduledAt.getTime(), activityMs) + input.graceMs);
}
