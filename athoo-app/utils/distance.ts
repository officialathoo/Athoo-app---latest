export function isValidCoordinate(lat: unknown, lon: unknown): lat is number {
  const a = Number(lat);
  const b = Number(lon);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

export function isLocationFresh(updatedAt?: string | Date | null, maxAgeMinutes = 2): boolean {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMinutes * 60_000;
}

export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return Number.NaN;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const km = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  // Same-building / same-place noise should not show as kilometres away.
  return km < 0.08 ? 0 : Number(km.toFixed(km < 10 ? 2 : 1));
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(Number(km))) return 'Distance unavailable';
  if (Number(km) === 0) return '0 m away';
  if (Number(km) < 1) return `${Math.round(Number(km) * 1000)} m away`;
  return `${Number(km).toFixed(Number(km) < 10 ? 1 : 0)} km away`;
}
