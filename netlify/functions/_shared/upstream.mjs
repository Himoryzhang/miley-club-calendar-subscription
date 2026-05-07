const PRIMARY_UPSTREAM_HOST = "vip4.etmcn.com";
const ALLOWED_UPSTREAM_HOSTS = new Set([PRIMARY_UPSTREAM_HOST, "vip4.zj.etmcn.com"]);
const ALLOWED_UPSTREAM_PATH = "/Ashx/WeiXin.ashx";
const COURSE_ACTION = "GetCourse";
const COURSE_SETTING_ACTION = "GetCourseSetting";
const COURSE_RECORD_KEYS = [
  "CourseGuid",
  "ApplyCourseGuid",
  "MemberCourseGuid",
  "CourseDate",
  "courseName",
  "lessonName",
  "CourseName",
  "LessonName",
  "ClassSectionName",
  "ClassSectionGuid"
];
const COURSE_ARRAY_KEYS = [
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
const COURSE_DATE_KEYS = ["CourseDate", "LessonDate", "ClassDate", "Date", "Day", "date"];

export async function fetchUpstreamCourseResponse(requestLike) {
  const resolvedResponse = await fetchResolvedCourseResponse(requestLike);

  return {
    status: resolvedResponse.status,
    text: resolvedResponse.text,
    startDay: resolvedResponse.startDay,
    showCourseDays: resolvedResponse.showCourseDays
  };
}

export async function fetchResolvedCourseResponse(requestLike) {
  const startDay = normalizeRequestedStartDay(requestLike.startDay) ?? formatIsoDate(stripTime(new Date()));
  const startDate = parseRequestedStartDay(startDay) ?? stripTime(new Date());
  const showCourseDays = await fetchShowCourseDays(requestLike);
  const totalDays = normalizeTotalDays(showCourseDays);
  const upstreamResponses = await Promise.all(
    Array.from({ length: totalDays }, (_, offset) =>
      fetchCourseDayResponse(requestLike, addDays(startDate, offset))
    )
  );

  const failedResponse = upstreamResponses.find(
    (response) => response.status < 200 || response.status >= 300
  );

  if (failedResponse) {
    return {
      status: failedResponse.status,
      text: failedResponse.text,
      startDay,
      showCourseDays
    };
  }

  const mergedPayload = mergeCoursePayloads(upstreamResponses.map((response) => safeParseJson(response.text)));

  return {
    status: 200,
    text: JSON.stringify(mergedPayload),
    startDay,
    showCourseDays
  };
}

export function ensureString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${fieldName}.`);
  }

  return value.trim();
}

export function safeParseJson(value) {
  let current = value;

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "string") {
      return current;
    }

    try {
      current = JSON.parse(current);
    } catch {
      return current;
    }
  }

  return current;
}

async function fetchCourseDayResponse(requestLike, day) {
  const apiUrl = withAction(requestLike.apiUrl, COURSE_ACTION);
  let lastOkResponse = null;
  let lastResponse = null;

  for (const startDay of buildStartDayCandidates(day)) {
    const response = await fetchUpstreamActionResponse(
      {
        ...requestLike,
        apiUrl,
        startDay
      },
      COURSE_ACTION
    );

    lastResponse = response;

    if (response.status < 200 || response.status >= 300) {
      continue;
    }

    lastOkResponse = response;

    const payload = safeParseJson(response.text);
    const records = extractCourseRecords(payload);

    if (records.length === 0 || containsRequestedCourseDate(records, day)) {
      return response;
    }
  }

  return (
    lastOkResponse ??
    lastResponse ?? {
      status: 500,
      text: "读取课程失败，请稍后再试。"
    }
  );
}

export function detectContentType(value) {
  try {
    JSON.parse(value);
    return "application/json; charset=utf-8";
  } catch {
    return "text/plain; charset=utf-8";
  }
}

export function slugifyFilename(value) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "calendar"
  );
}

async function fetchShowCourseDays(requestLike) {
  try {
    const upstreamResponse = await fetchUpstreamActionResponse(
      {
        ...requestLike,
        apiUrl: withAction(requestLike.apiUrl, COURSE_SETTING_ACTION)
      },
      COURSE_SETTING_ACTION
    );

    if (upstreamResponse.status < 200 || upstreamResponse.status >= 300) {
      return null;
    }

    return extractShowCourseDays(safeParseJson(upstreamResponse.text));
  } catch {
    return null;
  }
}

async function fetchUpstreamActionResponse(requestLike, action) {
  const upstreamUrl = validateUpstreamUrl(requestLike.apiUrl, action);
  const formData = buildUpstreamFormData(requestLike, action);
  const referer = resolveUpstreamReferer(requestLike.sourceUrl, upstreamUrl);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      accept: "*/*",
      "accept-language": "zh-CN,zh;q=0.9",
      origin: upstreamUrl.origin,
      referer,
      "x-requested-with": "XMLHttpRequest"
    },
    body: formData.toString()
  });

  return {
    status: upstreamResponse.status,
    text: await upstreamResponse.text()
  };
}

function validateUpstreamUrl(value, action = COURSE_ACTION) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Missing apiUrl.");
  }

  const url = normalizeUpstreamUrl(value);

  if (url.protocol !== "https:") {
    throw new Error("Upstream apiUrl must use https.");
  }

  if (!ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
    throw new Error(`Upstream host must be one of ${Array.from(ALLOWED_UPSTREAM_HOSTS).join(", ")}.`);
  }

  if (url.pathname !== ALLOWED_UPSTREAM_PATH) {
    throw new Error(`Upstream path must be ${ALLOWED_UPSTREAM_PATH}.`);
  }

  if (url.searchParams.get("action") !== action) {
    throw new Error(`Upstream action must be ${action}.`);
  }

  return url;
}

function buildUpstreamFormData(body, action = COURSE_ACTION) {
  const openId = ensureString(body.openId, "openId");
  const lic = ensureString(body.lic, "lic");
  const formData = new URLSearchParams({
    openID: openId,
    lic
  });

  if (action === COURSE_ACTION) {
    const startDay = ensureString(body.startDay, "startDay");
    const memberGuid = ensureString(body.memberGuid, "memberGuid");
    const pageType = typeof body.pageType === "string" ? body.pageType.trim() : "";

    formData.set("startDay", startDay);
    formData.set("memberGuid", memberGuid);

    if (pageType) {
      formData.set("pagetype", pageType);
    }
  }

  return formData;
}

function withAction(apiUrl, action) {
  const url = normalizeUpstreamUrl(apiUrl);
  url.searchParams.set("action", action);
  return url.toString();
}

function normalizeUpstreamUrl(value) {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(ensureString(value, "apiUrl"));

  if (ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
    url.protocol = "https:";
    url.hostname = PRIMARY_UPSTREAM_HOST;
  }

  return url;
}

function resolveUpstreamReferer(value, upstreamUrl) {
  const fallback = new URL("/WeiXin/selfLesson.aspx", upstreamUrl);

  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback.toString();
  }

  try {
    const url = new URL(value);

    if (ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
      url.protocol = upstreamUrl.protocol;
      url.hostname = upstreamUrl.hostname;
    }

    return url.toString();
  } catch {
    return fallback.toString();
  }
}

function extractShowCourseDays(payload) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === "number" && Number.isFinite(payload)) {
    return Math.max(0, Math.floor(payload));
  }

  if (typeof payload === "string") {
    const parsed = Number(payload.trim());
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = extractShowCourseDays(item);
      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  if (typeof payload !== "object") {
    return null;
  }

  if ("showCourseDays" in payload) {
    return extractShowCourseDays(payload.showCourseDays);
  }

  if ("ShowCourseDays" in payload) {
    return extractShowCourseDays(payload.ShowCourseDays);
  }

  for (const value of Object.values(payload)) {
    const resolved = extractShowCourseDays(value);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

function normalizeTotalDays(showCourseDays) {
  if (typeof showCourseDays === "number" && Number.isFinite(showCourseDays)) {
    return Math.max(1, Math.floor(showCourseDays) + 1);
  }

  return 1;
}

function mergeCoursePayloads(payloads) {
  const normalizedPayloads = payloads.map((payload) => safeParseJson(payload));
  const template = normalizedPayloads.find((payload) => payload !== null && payload !== undefined);
  const merged = [];
  const seen = new Set();

  for (const payload of normalizedPayloads) {
    for (const record of extractCourseRecords(payload)) {
      const key = buildCourseRecordKey(record);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(record);
    }
  }

  if (merged.length === 0) {
    return template ?? [];
  }

  return injectMergedRecords(template, merged);
}

function extractCourseRecords(payload) {
  const parsedPayload = safeParseJson(payload);

  if (Array.isArray(parsedPayload)) {
    const directRecords = parsedPayload.filter(isLikelyCourseRecord);
    if (directRecords.length > 0) {
      return directRecords;
    }

    return parsedPayload.flatMap((item) => extractCourseRecords(item));
  }

  if (!isRecord(parsedPayload)) {
    return [];
  }

  const collected = [];

  for (const key of COURSE_ARRAY_KEYS) {
    if (key in parsedPayload) {
      collected.push(...extractCourseRecords(parsedPayload[key]));
    }
  }

  if (collected.length > 0) {
    return collected;
  }

  for (const value of Object.values(parsedPayload)) {
    collected.push(...extractCourseRecords(value));
  }

  return collected;
}

function isLikelyCourseRecord(value) {
  return isRecord(value) && COURSE_RECORD_KEYS.some((key) => key in value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildCourseRecordKey(record) {
  const parts = [
    typeof record.MemberCourseGuid === "string" ? record.MemberCourseGuid : "",
    typeof record.ApplyCourseGuid === "string" ? record.ApplyCourseGuid : "",
    typeof record.CourseGuid === "string" ? record.CourseGuid : "",
    typeof record.CourseDate === "string" ? record.CourseDate : "",
    typeof record.ClassSectionGuid === "string" ? record.ClassSectionGuid : "",
    typeof record.ClassSectionName === "string" ? record.ClassSectionName : ""
  ];

  if (parts.some(Boolean)) {
    return parts.join("|");
  }

  return JSON.stringify(record);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeRequestedStartDay(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseRequestedStartDay(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function buildStartDayCandidates(date) {
  return Array.from(
    new Set([formatIsoDate(date), formatPaddedSlashDate(date), formatSlashDate(date)])
  );
}

function containsRequestedCourseDate(records, day) {
  const requestedDay = formatIsoDate(day);

  return records.some((record) => extractCourseRecordDay(record) === requestedDay);
}

function extractCourseRecordDay(record) {
  for (const key of COURSE_DATE_KEYS) {
    if (key in record) {
      return normalizeCourseDayValue(record[key]);
    }
  }

  return null;
}

function normalizeCourseDayValue(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return formatIsoDate(value);
  }

  if (typeof value === "number") {
    const parsed = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(parsed.valueOf()) ? null : formatIsoDate(parsed);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (directMatch) {
    return `${directMatch[1]}-${pad(directMatch[2])}-${pad(directMatch[3])}`;
  }

  const parsed = new Date(trimmed.replace(/\./g, "-").replace(/\//g, "-").replace(/\s+/, "T"));
  return Number.isNaN(parsed.valueOf()) ? null : formatIsoDate(parsed);
}

function injectMergedRecords(template, records) {
  const replaced = replaceFirstCourseCollection(template, records);
  return replaced === null ? records : replaced;
}

function replaceFirstCourseCollection(value, records) {
  if (Array.isArray(value)) {
    if (value.some(isLikelyCourseRecord)) {
      return records;
    }

    for (let index = 0; index < value.length; index += 1) {
      const replacedChild = replaceFirstCourseCollection(value[index], records);
      if (replacedChild !== null) {
        return value.map((item, currentIndex) => (currentIndex === index ? replacedChild : item));
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of COURSE_ARRAY_KEYS) {
    if (!(key in value)) {
      continue;
    }

    const current = value[key];
    if (Array.isArray(current)) {
      return {
        ...value,
        [key]: records
      };
    }

    const replacedChild = replaceFirstCourseCollection(current, records);
    if (replacedChild !== null) {
      return {
        ...value,
        [key]: replacedChild
      };
    }
  }

  for (const [key, child] of Object.entries(value)) {
    const replacedChild = replaceFirstCourseCollection(child, records);
    if (replacedChild !== null) {
      return {
        ...value,
        [key]: replacedChild
      };
    }
  }

  return null;
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPaddedSlashDate(date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function formatSlashDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
