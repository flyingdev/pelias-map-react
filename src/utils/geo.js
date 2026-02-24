/**
 * Convert a distance in meters to screen pixels at a given latitude and zoom level.
 * Uses the Web Mercator ground resolution formula.
 */
export function metersToPixels(meters, latitude, zoom) {
  const groundRes =
    (Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137) /
    (256 * Math.pow(2, zoom));
  return meters / groundRes;
}

/**
 * Get the [lng, lat] coordinates for a maneuver's turn point.
 * Prefers begin_shape_index into the route coordinates array,
 * falls back to maneuver.point if present.
 */
export function getTurnCoordsFromManeuver(maneuver, routeCoordinates) {
  if (!routeCoordinates || !routeCoordinates.length) return null;

  const idx = maneuver?.begin_shape_index;
  if (typeof idx === 'number' && idx >= 0 && idx < routeCoordinates.length) {
    return routeCoordinates[idx];
  }

  if (maneuver?.point?.lon != null && maneuver?.point?.lat != null) {
    return [maneuver.point.lon, maneuver.point.lat];
  }

  return null;
}
