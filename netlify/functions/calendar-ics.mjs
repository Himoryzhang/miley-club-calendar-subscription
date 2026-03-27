import {
  createUpcomingCourseFilterOptions,
  createDefaultStartDay,
  extractNormalizedCourses
} from "../../dist/lib/course-data.js";
import { buildCalendarIcs } from "../../dist/lib/ics.js";
import { parseSubscriptionToken } from "../../server/subscription-token.mjs";
import {
  ensureString,
  fetchResolvedCourseResponse,
  safeParseJson,
  slugifyFilename
} from "./_shared/upstream.mjs";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token || !token.trim()) {
      throw new Error("缺少 token。请从页面重新生成订阅链接。");
    }

    const tokenPayload = parseSubscriptionToken(token);
    const requestContext = {
      sourceUrl: "",
      apiUrl: ensureString(tokenPayload.apiUrl, "apiUrl"),
      openId: ensureString(tokenPayload.openId, "openId"),
      lic: ensureString(tokenPayload.lic, "lic"),
      memberGuid: ensureString(tokenPayload.memberGuid, "memberGuid"),
      pageType: typeof tokenPayload.pageType === "string" ? tokenPayload.pageType.trim() : "",
      startDay: createDefaultStartDay()
    };
    const calendarName =
      typeof tokenPayload.calendarName === "string" && tokenPayload.calendarName.trim().length > 0
        ? tokenPayload.calendarName.trim()
        : "Miley's English Club 课程日历订阅";
    const upstreamResponse = await fetchResolvedCourseResponse(requestContext);

    if (upstreamResponse.status < 200 || upstreamResponse.status >= 300) {
      throw new Error(
        `上游接口返回 ${upstreamResponse.status}：${upstreamResponse.text.slice(0, 200)}`
      );
    }

    const payload = safeParseJson(upstreamResponse.text);
    const courses = extractNormalizedCourses(
      payload,
      createUpcomingCourseFilterOptions(upstreamResponse.showCourseDays)
    );
    const ics = buildCalendarIcs(courses, calendarName);

    return new Response(ics, {
      status: 200,
      headers: {
        "cache-control": "no-store, max-age=0",
        "content-disposition": `inline; filename="${slugifyFilename(calendarName)}.ics"`,
        "content-type": "text/calendar; charset=utf-8"
      }
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {
      status: 400,
      headers: {
        "content-type": "text/plain; charset=utf-8"
      }
    });
  }
};
