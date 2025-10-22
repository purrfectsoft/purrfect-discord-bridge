import { DateTime } from "luxon";

export function now(tz: string): DateTime {
  return DateTime.now().setZone(tz);
}

export function windowHoursEnd(tz: string, hours: number): { start: DateTime; end: DateTime } {
  const end = now(tz);
  const start = end.minus({ hours });
  return { start, end };
}
