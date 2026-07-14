import React, { useMemo } from "react";
import { OpenStreetMapPreview } from "@/components/maps/OpenStreetMapPreview";

type Props = {
  latitude?: number;
  longitude?: number;
  draggable?: boolean;
  onCoordinateChange?: (latitude: number, longitude: number) => void;
  showsUserLocation?: boolean;
};

function validCoordinate(value: number | undefined, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Backward-compatible map component used throughout Athoo.
 *
 * The old implementation conditionally mounted a native commercial-map component and therefore
 * depended on a commercial native map key on Android. The current implementation renders
 * OpenStreetMap tiles directly, requires no commercial map key, and keeps the
 * existing coordinate-selection contract intact.
 */
export function AthooMapFallback({
  latitude,
  longitude,
  draggable = false,
  onCoordinateChange,
}: Props) {
  const coordinate = useMemo(() => ({
    latitude: validCoordinate(latitude, -90, 90) ? latitude : 30.3753,
    longitude: validCoordinate(longitude, -180, 180) ? longitude : 69.3451,
  }), [latitude, longitude]);

  return (
    <OpenStreetMapPreview
      latitude={coordinate.latitude}
      longitude={coordinate.longitude}
      markers={[{ ...coordinate, kind: "selected", id: "selected-location" }]}
      interactive={draggable}
      onCoordinateChange={onCoordinateChange}
    />
  );
}
