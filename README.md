# WeChat Course Calendar Sync

把微信约课页面里的课程信息同步到日历。

当前原型采用“半自动 ICS 订阅链接”方案：

1. 用户粘贴微信约课页 `selfLesson.aspx?...` 的完整 URL
2. 前端从 URL 中提取 `openID`、`lic`、`memberGuid` 等参数
3. 前端通过同源代理请求课程接口
4. 服务端生成带加密 `token` 的动态 `.ics` 订阅链接
5. 用户把这个订阅链接加到 Google Calendar 或 Apple Calendar
6. 日历应用后续会定期刷新该链接

## 上游页面与接口

- 约课页: [https://vip4.zj.etmcn.com/WeiXin/selfLesson.aspx](https://vip4.zj.etmcn.com/WeiXin/selfLesson.aspx)
- 课程接口: [https://vip4.zj.etmcn.com/Ashx/WeiXin.ashx?action=GetCourse](https://vip4.zj.etmcn.com/Ashx/WeiXin.ashx?action=GetCourse)

## 为什么不能前端直连接口

上游站点没有返回 `Access-Control-Allow-Origin`，所以浏览器从 `http://127.0.0.1:4173` 直接请求 `vip4.zj.etmcn.com` 会被 CORS 拦截。

当前项目的解决方式是同源代理：

1. 前端把参数发给 `/api/get-course`
2. `netlify dev` 或 Netlify Functions 转发到微信课程接口
3. 浏览器从同源地址拿回结果继续展示课程
4. 服务端还提供 `/calendar.ics?token=...` 动态订阅地址

## Netlify 部署

当前仓库已经按 Netlify 免费方案实现：

- 静态页面直接部署
- `netlify/functions/api-get-course.mjs` 负责课程代理
- `netlify/functions/calendar-ics.mjs` 负责动态订阅源
- [`netlify.toml`](./netlify.toml) 已经配置好构建、Functions 目录和路由 rewrite

详细部署说明见：

- [`docs/netlify.md`](./docs/netlify.md)

## 本地启动

```bash
pnpm build
pnpm preview
```

`pnpm preview` 当前等价于 `netlify dev`。

默认地址：

```text
http://127.0.0.1:4173
```

## 页面使用流程

1. 打开 `http://127.0.0.1:4173`
2. 粘贴微信约课页面完整 URL
3. 点击“抓取课程数据”
4. 检查课程列表
5. 复制页面生成的订阅链接
6. 部署到公开 HTTPS 地址后，把新的订阅链接添加到 Google Calendar 或 Apple Calendar

## 输入参数来源

用户只需要提供微信约课页完整链接，例如：

```text
https://vip4.zj.etmcn.com/WeiXin/selfLesson.aspx?oid=...&openid=...&lic=...&licence=...&MemberGuid=...&MPUserGuid=...&appid=...&mobile=#
```

前端会从 URL 中提取：

- `openID` / `openid` / `oid`
- `lic` / `licence`
- `MemberGuid` / `memberGuid`
- `pagetype` / `pageType`

## 课程数据解析规则

接口响应的实际课程列表可能直接是数组，也可能包在对象里，例如：

- 顶层数组
- `Rdata` 字段中的 JSON 字符串

当前解析器会统一抽出课程数组，并按以下规则生成标准化数据：

- `title` ← `courseName`
- `startTime` / `endTime` ← `CourseDate` + `ClassSectionName`
- `comment` ← `TeacherNames` + `ClassRoomName`
- 默认时区固定为 `+08:00`

只保留“已报名课程”，判定条件包括：

- `ApplyCourseDoStatus === 1`
- 或存在有效的 `MemberCourseGuid`
- 或存在有效的 `CourseInfoGuid`

示例响应见 [`docs/api/get_course_response.json`](./docs/api/get_course_response.json)。

## 日历订阅

当前页面会先向服务端申请一个订阅 token，再生成动态 ICS 订阅链接，例如：

```text
https://your-domain.example/calendar.ics?token=eyJhbGciOi...
```

这个地址每次被访问时，都会实时去微信课程接口取最新数据，并重新生成 `.ics`。

注意：

- `http://127.0.0.1:4173` 这种本地地址不能直接给 Google Calendar 订阅
- 因为 Google 服务器访问不到你的本机
- 真正订阅时，需要把项目部署到公开 HTTPS 地址
- 当前项目已经适配 Netlify，可直接部署到 `*.netlify.app` 或自定义域名
- 公开订阅链接不再直接暴露 `openid`、`lic`、`MemberGuid`
- 但订阅链接本身仍然是一个可访问你课程数据的 bearer URL，不要公开分享

详细说明见：

- [`docs/google-calendar.md`](./docs/google-calendar.md)
- [`docs/netlify.md`](./docs/netlify.md)
- [`docs/architecture.md`](./docs/architecture.md)
