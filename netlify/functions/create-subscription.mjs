import { extractRequestContext } from "../../dist/lib/course-data.js";
import { createSubscriptionToken } from "../../server/subscription-token.mjs";
import { ensureString } from "./_shared/upstream.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        allow: "POST",
        "content-type": "text/plain; charset=utf-8"
      }
    });
  }

  try {
    const body = await request.json();
    const sourceUrl = ensureString(body.sourceUrl, "sourceUrl");
    const calendarName =
      typeof body.calendarName === "string" && body.calendarName.trim().length > 0
        ? body.calendarName.trim()
        : "Miley's English Club 课程日历订阅";
    const requestContext = extractRequestContext(sourceUrl);
    const token = createSubscriptionToken({
      apiUrl: requestContext.apiUrl,
      openId: requestContext.openId,
      lic: requestContext.lic,
      memberGuid: requestContext.memberGuid,
      pageType: requestContext.pageType ?? "",
      calendarName
    });
    const subscriptionUrl = new URL("/calendar.ics", request.url);
    subscriptionUrl.searchParams.set("token", token);

    return new Response(
      JSON.stringify({
        subscriptionUrl: subscriptionUrl.toString()
      }),
      {
        status: 200,
        headers: {
          "cache-control": "no-store, max-age=0",
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 400,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  }
};
