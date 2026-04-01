import { addMinutes, toIsoDate } from "./date.js";
import type {
  CourseFetchResult,
  CourseRequestContext,
  NormalizedCourse,
  RawCourseRecord
} from "./types.js";

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_TIMEZONE_OFFSET = "+08:00";
const UPSTREAM_API_PATH = "/Ashx/WeiXin.ashx";
const COURSE_ACTION = "GetCourse";

const ARRAY_KEYS = [
  "data",
  "rows",
  "list",
  "result",
  "results",
  "courses",
  "courseList",
  "Table",
  "Data",
  "Rdata",
  "rdata"
];

const TITLE_KEYS = [
  "CourseName",
  "LessonName",
  "ClassName",
  "Name",
  "Title",
  "courseName",
  "lessonName",
  "className"
];

const DATE_KEYS = [
  "CourseDate",
  "LessonDate",
  "ClassDate",
  "Date",
  "Day",
  "date"
];

const START_KEYS = [
  "StartDateTime",
  "StartTime",
  "CourseStartTime",
  "BeginTime",
  "SDate",
  "startDateTime",
  "startTime"
];

const END_KEYS = [
  "EndDateTime",
  "EndTime",
  "CourseEndTime",
  "FinishTime",
  "EDate",
  "endDateTime",
  "endTime"
];

const RANGE_KEYS = ["CourseTime", "LessonTime", "TimeRange", "timeRange"];
const COACH_KEYS = ["TeacherName", "CoachName", "TrainerName", "teacherName"];
const LOCATION_KEYS = ["StoreName", "RoomName", "Location", "storeName", "location"];
const NOTES_KEYS = ["Remark", "RemarkInfo", "StatusName", "remark", "statusName"];

interface CourseFilterOptions {
  from?: Date;
  until?: Date;
}

export function createDefaultStartDay(): string {
  return toIsoDate(new Date());
}

export function extractRequestContext(sourceUrl: string, startDay = createDefaultStartDay()): CourseRequestContext {
  const url = new URL(sourceUrl.trim());
  url.protocol = "https:";
  const openId =
    pickQueryValue(url, ["openID", "openid", "oid"]) ?? "";
  const lic =
    pickQueryValue(url, ["lic", "licence"]) ?? "";
  const memberGuid =
    pickQueryValue(url, ["memberGuid", "MemberGuid"]) ?? "";
  const pageType =
    pickQueryValue(url, ["pagetype", "pageType"]) ?? "";

  if (!openId || !lic || !memberGuid) {
    throw new Error("这个链接不完整，请重新从微信约课页面复制完整链接。");
  }

  const apiUrl = new URL(`${UPSTREAM_API_PATH}?action=${COURSE_ACTION}`, url);
  apiUrl.protocol = "https:";

  return {
    sourceUrl: url.toString(),
    apiUrl: apiUrl.toString(),
    openId,
    lic,
    memberGuid,
    pageType,
    startDay
  };
}

export async function fetchCoursePayload(request: CourseRequestContext): Promise<CourseFetchResult> {
  if (window.location.protocol === "file:") {
    throw new Error("当前页面打开方式不对，请用浏览器正常打开本工具后再试。");
  }

  const response = await fetch("/api/get-course", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      accept: "application/json, text/plain, */*"
    },
    body: JSON.stringify({
      apiUrl: request.apiUrl,
      sourceUrl: request.sourceUrl,
      openId: request.openId,
      startDay: request.startDay,
      lic: request.lic,
      memberGuid: request.memberGuid,
      pageType: request.pageType ?? ""
    })
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error("读取课程失败，请稍后再试。");
  }

  const parsed = parsePossiblySerializedPayload(responseText);

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "payload" in parsed &&
    "startDay" in parsed &&
    typeof parsed.startDay === "string"
  ) {
    const result = parsed as Partial<CourseFetchResult>;
    return {
      payload: result.payload,
      startDay: result.startDay ?? request.startDay,
      showCourseDays: typeof result.showCourseDays === "number" ? result.showCourseDays : null
    };
  }

  return {
    payload: parsed,
    startDay: request.startDay,
    showCourseDays: null
  };
}

export function createUpcomingCourseFilterOptions(
  showCourseDays?: number | null,
  from = new Date()
): CourseFilterOptions {
  const start = new Date(from);
  const normalizedDays = Number.isFinite(showCourseDays) ? Math.max(0, Math.floor(showCourseDays ?? 0)) : null;

  if (normalizedDays === null) {
    return { from: start };
  }

  const until = new Date(start);
  until.setDate(until.getDate() + normalizedDays);
  until.setHours(23, 59, 59, 999);

  return {
    from: start,
    until
  };
}

export function extractNormalizedCourses(payload: unknown, options: CourseFilterOptions = {}): NormalizedCourse[] {
  const fromTime = options.from?.getTime();
  const untilTime = options.until?.getTime();
  const parsedPayload = parsePossiblySerializedPayload(payload);
  const rawCourses = extractCourseArray(parsedPayload);

  return rawCourses
    .filter(isRegisteredCourse)
    .map(normalizeCourse)
    .filter((course): course is NormalizedCourse => course !== null)
    .filter((course) => {
      const courseTime = course.start.getTime();

      if (fromTime !== undefined && courseTime < fromTime) {
        return false;
      }

      if (untilTime !== undefined && courseTime > untilTime) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function countRawCourses(payload: unknown): number {
  return extractCourseArray(parsePossiblySerializedPayload(payload)).length;
}

export function toPrototypeCourseJson(courses: NormalizedCourse[]): Array<{
  title: string;
  startTime: string;
  endTime: string;
  comment: string;
}> {
  return courses.map((course) => ({
    title: course.title,
    startTime: course.startTime,
    endTime: course.endTime,
    comment: course.comment ?? ""
  }));
}

function normalizeCourse(raw: RawCourseRecord): NormalizedCourse | null {
  const title = pickFirstString(raw, TITLE_KEYS) ?? "Booked Course";
  const coach = pickFirstString(raw, ["TeacherNames", ...COACH_KEYS]);
  const location = pickFirstString(raw, ["ClassRoomName", ...LOCATION_KEYS]);
  const notes = pickFirstString(raw, NOTES_KEYS);
  const comment = [coach, location].filter(Boolean).join(" ").trim() || undefined;
  const { start, end } = resolveCourseWindow(raw);

  if (!start) {
    return null;
  }

  const startTime = formatTimeWithOffset(start);
  const endTime = formatTimeWithOffset(end ?? addMinutes(start, 60));

  return {
    id: pickFirstString(raw, ["CourseGuid", "ApplyCourseGuid", "MemberCourseGuid"]) ?? buildStableId(title, start, location),
    title,
    start,
    end: end ?? addMinutes(start, 60),
    startTime,
    endTime,
    comment,
    coach,
    location,
    notes,
    raw
  };
}

function resolveCourseWindow(raw: RawCourseRecord): { start?: Date; end?: Date } {
  const exactWindow = resolveSampleWindow(raw);
  if (exactWindow.start) {
    return exactWindow;
  }

  const startCandidate = pickFirstValue(raw, START_KEYS);
  const endCandidate = pickFirstValue(raw, END_KEYS);
  const dateCandidate = pickFirstString(raw, DATE_KEYS);
  const rangeCandidate = pickFirstString(raw, RANGE_KEYS);

  const start =
    parseFlexibleDateTime(startCandidate) ??
    parseFlexibleDateTime(startCandidate, dateCandidate) ??
    parseRangeValue(rangeCandidate, dateCandidate)?.start;

  const end =
    parseFlexibleDateTime(endCandidate) ??
    parseFlexibleDateTime(endCandidate, dateCandidate) ??
    parseRangeValue(rangeCandidate, dateCandidate)?.end;

  return { start, end };
}

function resolveSampleWindow(raw: RawCourseRecord): { start?: Date; end?: Date } {
  const courseDate = pickFirstString(raw, ["CourseDate"]);
  const section = pickFirstString(raw, ["ClassSectionName"]);

  if (!courseDate || !section) {
    return {};
  }

  const dateMatch = courseDate.match(/^(\d{4}-\d{2}-\d{2})/);
  const sectionMatch = section.match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);

  if (!dateMatch || !sectionMatch) {
    return {};
  }

  const [, day] = dateMatch;
  const [, startTime, endTime] = sectionMatch;

  return {
    start: new Date(`${day}T${startTime}:00${DEFAULT_TIMEZONE_OFFSET}`),
    end: new Date(`${day}T${endTime}:00${DEFAULT_TIMEZONE_OFFSET}`)
  };
}

function parsePossiblySerializedPayload(payload: unknown): unknown {
  if (typeof payload !== "string") {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function extractCourseArray(payload: unknown): RawCourseRecord[] {
  const parsedPayload = parsePossiblySerializedPayload(payload);

  if (Array.isArray(parsedPayload)) {
    return parsedPayload.filter(isRecord);
  }

  if (!isRecord(parsedPayload)) {
    return [];
  }

  for (const key of ARRAY_KEYS) {
    const records = extractCourseArray(parsedPayload[key]);
    if (records.length > 0) {
      return records;
    }
  }

  for (const value of Object.values(parsedPayload)) {
    const records = extractCourseArray(value);
    if (records.length > 0) {
      return records;
    }
  }

  return [];
}

function parseRangeValue(value: string | undefined, dateString: string | undefined) {
  if (!value || !dateString) {
    return null;
  }

  const match = value.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-~]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!match) {
    return null;
  }

  return {
    start: parseFlexibleDateTime(match[1], dateString),
    end: parseFlexibleDateTime(match[2], dateString)
  };
}

function parseFlexibleDateTime(value: unknown, dateString?: string): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value;
  }

  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const timeOnlyMatch = trimmed.match(/^\d{1,2}:\d{2}(?::\d{2})?$/);
  if (timeOnlyMatch && dateString) {
    return parseDateCandidate(`${dateString} ${trimmed}`);
  }

  return parseDateCandidate(trimmed);
}

function parseDateCandidate(value: string): Date | undefined {
  const normalized = value
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/, "T");

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function pickFirstString(record: RawCourseRecord, keys: string[]): string | undefined {
  const value = pickFirstValue(record, keys);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickFirstValue(record: RawCourseRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function isRegisteredCourse(record: RawCourseRecord): boolean {
  const applyStatus = record.ApplyCourseDoStatus;
  const memberCourseGuid = pickFirstString(record, ["MemberCourseGuid"]);
  const courseInfoGuid = pickFirstString(record, ["CourseInfoGuid"]);

  return applyStatus === 1 || isRealGuid(memberCourseGuid) || isRealGuid(courseInfoGuid);
}

function pickQueryValue(url: URL, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function formatTimeWithOffset(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate()
  )}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(
    shifted.getUTCSeconds()
  )}${DEFAULT_TIMEZONE_OFFSET}`;
}

function buildStableId(title: string, start: Date, location?: string): string {
  const seed = `${title}|${start.toISOString()}|${location ?? ""}`;
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRealGuid(value?: string): boolean {
  return Boolean(value && value !== ZERO_GUID);
}

function isRecord(value: unknown): value is RawCourseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
