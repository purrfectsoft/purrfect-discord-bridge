import { DateTime } from "luxon";


export function now(tz) { return DateTime.now().setZone(tz); }
export function windowHoursEnd(tz, hours) {
const end = now(tz);
const start = end.minus({ hours });
return { start, end };
}
