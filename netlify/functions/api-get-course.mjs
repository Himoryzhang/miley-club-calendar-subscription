import { fetchUpstreamCourseResponse, safeParseJson } from "./_shared/upstream.mjs";

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
    const upstreamResponse = await fetchUpstreamCourseResponse(body);

    if (upstreamResponse.status < 200 || upstreamResponse.status >= 300) {
      return new Response(
        JSON.stringify({
          error: "读取课程失败，请稍后再试。"
        }),
        {
          status: upstreamResponse.status,
          headers: {
            "cache-control": "no-store, max-age=0",
            "content-type": "application/json; charset=utf-8"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        payload: safeParseJson(upstreamResponse.text),
        startDay: upstreamResponse.startDay,
        showCourseDays: upstreamResponse.showCourseDays
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
