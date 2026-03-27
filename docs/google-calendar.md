# Google Calendar 订阅指南

当前项目已经改成“ICS 订阅链接”方案，不再使用 OAuth。

也就是说，流程不再是“授权写入 Google Calendar”，而是：

1. 你在本项目页面里粘贴微信约课 URL
2. 项目生成一个动态 `.ics` 订阅链接
3. Google Calendar 订阅这个链接
4. 之后 Google 会定期重新抓取这个 `.ics` 地址，课程会自动更新

这是一个“半自动”方案：

- 优点：用户不需要 Google OAuth，不需要授权弹窗
- 优点：订阅一次后，后续会自动刷新
- 代价：Google 的刷新频率不是实时的，而是由 Google 自己决定
- 代价：订阅链接必须是 Google 服务器可以访问到的公开地址

## 核心前提

### 1. 不能用 `http://127.0.0.1:4173` 直接给 Google 订阅

本地地址只能在你自己电脑上访问，Google 服务器访问不到。

所以：

- 本地地址只适合预览和测试 `.ics` 输出是否正确
- 真正给 Google Calendar 订阅时，必须使用公开可访问的地址

这通常意味着你需要把当前项目部署到一个公开 HTTPS 域名下。

### 2. 订阅链接本质上是一个动态 ICS 地址

当前项目会生成类似下面这样的链接：

```text
https://your-domain.example/calendar.ics?token=eyJhbGciOi...
```

这个地址每次被访问时，服务端都会：

1. 解析订阅 `token`
2. 在服务端恢复请求微信接口所需的参数
3. 请求微信课程接口
4. 解析课程列表
5. 实时生成 `.ics`

所以 Google Calendar 订阅的是“一个会动态刷新内容的 ICS 源”。

这里有两个安全点需要区分：

- 好处：公开 URL 里不再直接出现 `openid`、`lic`、`MemberGuid`
- 仍需注意：订阅链接本身仍然是私密链接，拿到链接的人依然可以读取你的课程订阅内容

## 第 1 步：本地验证订阅源是否工作

先在本地确认逻辑正确。

### 启动

```bash
pnpm build
pnpm preview
```

其中 `pnpm preview` 当前等价于 `netlify dev`。

打开：

```text
http://127.0.0.1:4173
```

### 测试流程

1. 粘贴微信约课页面完整 URL
2. 点击“抓取课程数据”
3. 检查课程列表是否正确
4. 复制页面里生成的订阅链接
5. 把订阅链接粘贴到浏览器地址栏，确认能返回 `.ics` 文本

如果这一步输出正常，说明动态订阅源逻辑已经通了。

## 第 2 步：把项目部署到公开 HTTPS 地址

Google Calendar 订阅要求 Google 能访问你的 `.ics` 链接。

因此部署后的地址至少要满足：

- 公开可访问
- 稳定
- 最好是 HTTPS

部署后，你的页面地址可能像：

```text
https://calendar.example.com/
```

这时页面里生成的订阅链接就会变成：

```text
https://calendar.example.com/calendar.ics?token=eyJhbGciOi...
```

这个链接才适合放进 Google Calendar。

## 第 3 步：在 Google Calendar 里添加订阅链接

根据 Google Calendar 官方帮助文档，添加 URL 日历需要在电脑浏览器中操作。

操作步骤：

1. 打开 [Google Calendar](https://calendar.google.com/)
2. 在左侧找到 `Other calendars`
3. 点击 `+`
4. 选择 `From URL`
5. 粘贴本项目生成的公开订阅链接
6. 点击添加

完成后，Google Calendar 会开始订阅这个 ICS 地址。

参考官方帮助：

- [Use a link to add a public calendar](https://support.google.com/calendar/answer/37100)

## 第 4 步：理解刷新机制

订阅方案不是“每次点按钮立即写入事件”。

它的机制是：

1. Google 先保存你的订阅链接
2. Google 后台定期重新请求这个链接
3. 你的服务重新生成最新的 `.ics`
4. Google 再把变化更新到日历里

所以需要注意：

- 刷新不是实时的
- 更新速度由 Google 控制
- 同一课程改动后，可能需要等待一段时间才会在 Google Calendar 中体现

这是订阅方案的正常行为，不是本项目单独的问题。

## 第 5 步：如果你想订阅到单独的课程日历

Google Calendar 的“From URL”会把该 ICS 源作为一个订阅日历出现，而不是直接写进你的主日历事件列表中。

这反而是订阅方案的优点：

- 可以单独开关显示
- 不会污染主日历
- 取消订阅很方便

如果你只想“看见课程安排并自动刷新”，订阅比 OAuth 写入更合适。

## 常见问题

### 1. 为什么本地生成了订阅链接，但 Google Calendar 加不上？

最常见原因是你给 Google 粘贴的是：

```text
http://127.0.0.1:4173/calendar.ics?...
```

Google 服务器无法访问你的本地电脑，所以不能用。

解决方式：

- 把项目部署到公开地址
- 在部署后的页面重新生成订阅链接
- 再把新的公开链接粘贴到 Google Calendar

### 2. 为什么我能在浏览器打开 `.ics`，但 Google 里还没更新？

这是因为 Google 订阅日历不是实时刷新的。

如果浏览器打开订阅链接能看到最新 `.ics`，通常说明你的服务端已经正常工作，剩下就是等待 Google 后台刷新。

### 3. 订阅链接已经不含 `sourceUrl` 了，是不是就绝对安全？

不会直接泄露原始参数，但也不能当成公开信息。

当前实现会把这些敏感参数放进服务端生成的加密 `token` 里，因此：

- 订阅地址里不再直接出现 `openid`
- 订阅地址里不再直接出现 `lic`
- 订阅地址里不再直接出现 `MemberGuid`

但只要别人拿到这个订阅链接，仍然可以访问该 ICS 订阅源。所以仍然建议：

- 不要把订阅链接公开分享给别人
- 不要把它发到公共仓库、公共群聊或公开网页
- 如果你怀疑链接已经泄露，重新生成订阅链接并停止使用旧链接

### 4. Google Calendar 里怎么删除订阅？

在 Google Calendar 左侧找到该订阅日历，进入设置后可以取消订阅或移除。

### 5. 订阅和下载 `.ics` 有什么区别？

下载 `.ics` 是一次性导入：

- 导入那一刻的数据会进入你的日历
- 后续课程变了，不会自动刷新

订阅链接是持续更新：

- 订阅一次以后，日历应用会定期重新拉取
- 更适合这种课程表会变化的场景

## Apple Calendar

Apple Calendar 也支持订阅日历链接。

Apple 官方说明中，用户可以通过日历的 Web 地址订阅，并设置自动更新频率。

参考官方帮助：

- [Subscribe to calendars on Mac](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac)

如果你主要是 Apple 生态，订阅方案通常会比 OAuth 更合适。

## 官方参考

- [Google Calendar Help: Add a calendar by URL](https://support.google.com/calendar/answer/37100)
- [Apple Support: Subscribe to calendars on Mac](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac)
