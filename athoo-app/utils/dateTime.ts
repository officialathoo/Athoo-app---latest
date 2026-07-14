export function combineLocalDateTime(date: string, time: string): Date | null {
  const d = String(date || '').trim();
  const t = String(time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const dt = new Date(`${d}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

export function isPastOrTooSoon(date: string, time: string, minMinutes = 20): string | null {
  const dt = combineLocalDateTime(date, time);
  if (!dt) return 'Please choose a valid booking date and time.';
  const min = Date.now() + minMinutes * 60 * 1000;
  if (dt.getTime() < min) return `Please choose a future time at least ${minMinutes} minutes from now.`;
  return null;
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}
