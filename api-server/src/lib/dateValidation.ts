export function parseLocalDateTime(dateValue: unknown, timeValue: unknown): Date | null {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ap = String(match[3] || '').toUpperCase();
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const dt = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

export function futureDateError(dateValue: unknown, timeValue: unknown, minMinutes = 20): string | null {
  const dt = parseLocalDateTime(dateValue, timeValue);
  if (!dt) return 'Please choose a valid booking date and time.';
  if (dt.getTime() < Date.now() + minMinutes * 60_000) return `Please choose a future booking time at least ${minMinutes} minutes from now.`;
  return null;
}
