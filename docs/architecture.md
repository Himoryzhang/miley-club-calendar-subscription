# 数据流图与系统架构图

本文档基于当前项目实现整理，覆盖本地 `netlify dev` 联调和 Netlify 部署两种运行方式。

## 数据流图

```mermaid

flowchart TD
    U["用户"] --> P["网页界面<br/>index.html + src/main.ts"]
    P --> A["解析约课链接<br/>提取 openId / lic / memberGuid"]
    A --> B["POST /api/get-course"]

    B --> G["课程代理<br/>本地 netlify dev 或 Netlify Function"]
    G --> S["上游接口<br/>GetCourseSetting"]
    S --> D["返回 showCourseDays"]
    D --> G
    G --> C["按日期循环请求<br/>GetCourse(startDay)"]
    C --> W["微信课程系统<br/>vip4.zj.etmcn.com"]
    W --> G
    G --> M["合并多天响应<br/>mergeCoursePayloads"]
    M --> P

    P --> N["标准化课程数据<br/>extractNormalizedCourses"]
    N --> R["页面展示课程列表"]

    P --> CS["POST /api/create-subscription"]
    CS --> T["生成加密订阅 token"]
    T --> SU["返回订阅链接<br/>/calendar.ics?token=..."]
    SU --> CA["Google Calendar / Apple Calendar"]

    CA --> ICS["GET /calendar.ics?token=..."]
    ICS --> K["解密 token"]
    K --> G2["订阅源函数<br/>calendar-ics"]
    G2 --> S2["再次请求 GetCourseSetting"]
    S2 --> C2["再次按日期请求 GetCourse(startDay)"]
    C2 --> W
    W --> G2
    G2 --> I["生成 ICS 日历文本"]
    I --> CA
```

## 系统架构图

```mermaid
flowchart LR
    subgraph Client["客户端"]
        Browser["浏览器"]
        Calendar["日历应用<br/>Google Calendar / Apple Calendar"]
    end

    subgraph Frontend["静态前端"]
        UI["index.html"]
        App["src/main.ts"]
        CourseLib["src/lib/course-data.ts"]
        ICSLib["src/lib/ics.ts"]
    end

    subgraph Runtime["服务端运行层"]
        LocalDev["netlify dev<br/>本地联调运行时"]
        Netlify["Netlify Functions"]
        GetCourseFn["api-get-course.mjs"]
        CreateSubFn["create-subscription.mjs"]
        CalendarFn["calendar-ics.mjs"]
    end

    subgraph Shared["共享服务与模块"]
        Upstream["netlify/functions/_shared/upstream.mjs"]
        Token["server/subscription-token.mjs"]
        Dist["dist/lib/*.js"]
    end

    subgraph External["外部系统"]
        Wechat["微信课程上游接口<br/>vip4.zj.etmcn.com"]
    end

    Browser --> UI
    UI --> App
    App --> CourseLib
    App --> ICSLib

    Browser --> LocalDev
    Browser --> Netlify

    LocalDev --> GetCourseFn
    LocalDev --> CreateSubFn
    LocalDev --> CalendarFn

    Netlify --> GetCourseFn
    Netlify --> CreateSubFn
    Netlify --> CalendarFn

    GetCourseFn --> Upstream
    CreateSubFn --> Token
    CreateSubFn --> Dist
    CalendarFn --> Upstream
    CalendarFn --> Token
    CalendarFn --> Dist

    Upstream --> Wechat
    Calendar --> CalendarFn
```

## 关键说明

- 前端本身不直接请求上游微信接口，而是统一走 `/api/get-course`，避免浏览器 CORS 限制。
- `GetCourseSetting` 用来拿 `showCourseDays`，服务端会据此循环请求多天的 `GetCourse(startDay)`。
- 订阅链接中的 `token` 不是明文参数，而是由 `server/subscription-token.mjs` 加密后的结果。
- 日历应用不是被动接收推送，而是定期重新请求 `/calendar.ics`，每次请求时服务端都会重新抓取最新课程并生成新的 ICS。
