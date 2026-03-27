# Netlify 部署指南

当前项目已经按 Netlify 结构接好了：

- 静态页面直接部署
- `/api/get-course` 通过 Netlify Function 代理微信课程接口
- `/api/create-subscription` 通过 Netlify Function 生成订阅 token
- `/calendar.ics` 通过 Netlify Function 动态生成订阅源

## 免费方案是否可行

可以。

根据 Netlify 官方文档和定价页：

- Netlify Functions 是官方支持的内置能力
- 免费计划包含 `Serverless functions`
- 免费计划包含每月一定额度的 credits，可用于函数计算和请求

官方参考：

- [Functions overview](https://docs.netlify.com/build/functions/overview/)
- [Netlify pricing](https://www.netlify.com/pricing/)

这类个人课程订阅工具通常请求量不高，免费方案大概率够用。

## 当前项目里与 Netlify 相关的文件

- [`netlify.toml`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/netlify.toml)
- [`netlify/functions/api-get-course.mjs`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/netlify/functions/api-get-course.mjs)
- [`netlify/functions/create-subscription.mjs`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/netlify/functions/create-subscription.mjs)
- [`netlify/functions/calendar-ics.mjs`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/netlify/functions/calendar-ics.mjs)
- [`netlify/functions/_shared/upstream.mjs`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/netlify/functions/_shared/upstream.mjs)
- [`server/subscription-token.mjs`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/server/subscription-token.mjs)

## 这些文件是怎么工作的

### `/api/get-course`

前端页面点击“抓取课程数据”时，请求的是：

```text
/api/get-course
```

在 Netlify 上，这个路径会被 rewrite 到：

```text
/.netlify/functions/api-get-course
```

函数会：

1. 校验上游地址只能是 `vip4.zj.etmcn.com/Ashx/WeiXin.ashx?action=GetCourse`
2. 组装表单参数
3. 请求微信课程接口
4. 把结果原样返回给前端

### `/api/create-subscription`

页面在用户粘贴微信约课链接后，请求的是：

```text
/api/create-subscription
```

在 Netlify 上，这个路径会被 rewrite 到：

```text
/.netlify/functions/create-subscription
```

函数会：

1. 校验页面提交的 `sourceUrl`
2. 提取课程接口请求所需参数
3. 使用 `SUBSCRIPTION_SECRET` 生成加密 token
4. 返回 `/calendar.ics?token=...` 形式的订阅链接

### `/calendar.ics`

页面生成的订阅链接指向：

```text
/calendar.ics?token=...
```

在 Netlify 上，这个路径会被 rewrite 到：

```text
/.netlify/functions/calendar-ics
```

函数会：

1. 读取查询参数里的 `token`
2. 使用 `SUBSCRIPTION_SECRET` 解密 token
3. 恢复请求微信课程接口所需参数
4. 请求微信课程接口
5. 解析并过滤课程
6. 动态生成 `.ics`
7. 返回 `text/calendar`

## 必须配置的环境变量

生产部署前，需要给 Netlify Functions 配置：

```text
SUBSCRIPTION_SECRET
```

它用于加密和解密订阅 token。没有这个值时：

- 本地 `pnpm preview` / `netlify dev` 会退回到开发用默认 secret
- Netlify 生产环境会拒绝生成订阅链接

建议使用长度至少 32 字节的随机字符串。

如果你使用 Netlify CLI，可以执行：

```bash
netlify env:set SUBSCRIPTION_SECRET your-random-secret --secret --scope functions
```

如果你使用 Netlify 控制台，可以在：

`Site configuration -> Environment variables`

里新增 `SUBSCRIPTION_SECRET`。

## 部署步骤

### 方案 A：在 Netlify Web 控制台部署

1. 把项目推到 GitHub、GitLab 或 Bitbucket
2. 登录 [Netlify](https://app.netlify.com/)
3. 点击 `Add new site`
4. 选择 `Import an existing project`
5. 连接你的代码仓库
6. 在构建设置中确认：

- Build command:

```text
pnpm build
```

- Publish directory:

```text
.
```

Netlify 会自动读取仓库里的 [`netlify.toml`](/Users/himoryzhang/Projects/wechat-course-calendar-sync/netlify.toml)。

### 方案 B：用 Netlify CLI

如果你本机已经安装了 Netlify CLI，可以在项目目录执行：

```bash
netlify deploy
```

正式发布：

```bash
netlify deploy --prod
```

如果你用 CLI，本地联调也可以考虑：

```bash
netlify dev
```

当前项目里的 `pnpm preview` / `pnpm start` 实际上就是 `netlify dev`。

## 部署成功后如何验证

假设你的 Netlify 生产域名是：

```text
https://your-site-name.netlify.app
```

### 1. 检查首页

打开：

```text
https://your-site-name.netlify.app
```

确认前端页面可用。

### 2. 检查抓课代理

在页面中粘贴微信约课 URL，点击“抓取课程数据”，确认课程列表正常显示。

如果能正常显示，说明：

- 静态页面部署成功
- `/api/get-course` 函数可用
- Netlify 出网请求微信接口成功

### 3. 检查订阅源

页面会生成一个类似下面的地址：

```text
https://your-site-name.netlify.app/calendar.ics?token=eyJhbGciOi...
```

直接在浏览器打开，应该能看到 `.ics` 文本。

如果这一步成功，Google Calendar 和 Apple Calendar 才有订阅的基础。

## Google Calendar 如何添加

Google 官方帮助说明：

1. 用电脑浏览器打开 Google Calendar
2. 在左侧 `Other calendars` 旁点击 `+`
3. 选择 `From URL`
4. 粘贴公开的 `.ics` 订阅链接
5. 点击 `Add calendar`

官方说明：

- [Use a link to add a public calendar](https://support.google.com/calendar/answer/37100)

## 注意事项

### 1. 订阅链接已经不直接暴露敏感参数

当前实现不会把 `openid`、`lic`、`MemberGuid` 直接放进公开查询参数。

对外暴露的是：

- 一个加密后的 `token`

这能避免原始参数直接出现在浏览器地址栏、聊天记录或 Google Calendar 的订阅 URL 输入框里。

但仍要注意：

- 不要公开分享订阅链接
- 不要把它贴到公共网页或公共仓库
- 如果链接疑似泄露，应重新从页面生成新的订阅链接

### 2. Netlify 免费额度不是无限的

虽然免费方案可用，但如果请求量明显上升，还是会吃到 credits。

不过按这个项目的使用模式：

- 个人使用
- 少量课程
- 少量订阅抓取

通常免费额度足够起步。

### 3. 上游站点可能限制机房访问

这是最现实的联调风险。

就算本地 `pnpm preview` 正常，也不代表 Netlify 机房请求 `vip4.zj.etmcn.com` 一定成功。

如果部署后页面抓课失败，优先检查：

- Netlify Function 日志
- 上游是否拒绝机房 IP
- 上游是否对 Referer、地区或 UA 有限制

## 建议的最短验证路径

1. 本地先确认页面抓课正常
2. 部署到 Netlify
3. 打开 Netlify 生产地址
4. 再试一次“抓取课程数据”
5. 打开生成的 `/calendar.ics` 链接
6. 最后把这个链接加到 Google Calendar
