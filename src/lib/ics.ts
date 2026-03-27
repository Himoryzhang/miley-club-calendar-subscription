import type { NormalizedCourse } from "./types.js";

export function buildCalendarIcs(
  courses: NormalizedCourse[],
  calendarName = "Miley's English Club 课程日历订阅"
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WeChat Course Calendar Sync//EN",
    "CALSCALE:GREGORIAN",
    `NAME:${escapeIcsText(calendarName)}`,
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`
  ];

  for (const course of courses) {
    const details = [
      course.coach ? `Coach: ${course.coach}` : undefined,
      course.location ? `Location: ${course.location}` : undefined,
      course.notes ? `Notes: ${course.notes}` : undefined
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(`${course.id}@wechat-course-calendar-sync`)}`);
    lines.push(`DTSTAMP:${formatIcsDate(new Date())}`);
    lines.push(`DTSTART:${formatIcsDate(course.start)}`);
    lines.push(`DTEND:${formatIcsDate(course.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(course.title)}`);

    if (details) {
      lines.push(`DESCRIPTION:${escapeIcsText(details)}`);
    }

    if (course.location) {
      lines.push(`LOCATION:${escapeIcsText(course.location)}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n");
}

export function downloadIcsFile(
  courses: NormalizedCourse[],
  filename = "wechat-course-calendar.ics",
  calendarName = "Miley's English Club 课程日历订阅"
): void {
  const ics = buildCalendarIcs(courses, calendarName);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("") +
    "T" +
    [
      pad(date.getUTCHours()),
      pad(date.getUTCMinutes()),
      pad(date.getUTCSeconds())
    ].join("") +
    "Z";
}

function foldIcsLine(line: string): string {
  if (line.length <= 74) {
    return line;
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const slice = line.slice(cursor, cursor + 74);
    chunks.push(cursor === 0 ? slice : ` ${slice}`);
    cursor += 74;
  }

  return chunks.join("\r\n");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
