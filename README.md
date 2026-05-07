# Miley's English Club Calendar Subscription

将微信约课页面中的已报名课程转换为可订阅的日历链接，方便在 Google Calendar、Apple Calendar 等支持 ICS 订阅的日历应用中持续查看和更新课程安排。

## 功能概览

- 读取微信约课页面中的已报名课程
- 生成可重复刷新的 ICS 订阅链接
- 支持自定义日历名称
- 适合部署为公开 HTTPS 服务，供日历应用长期订阅

## 使用流程

1. 打开页面并粘贴微信约课页面完整链接
2. 读取并确认课程列表
3. 复制生成的订阅链接
4. 将订阅链接添加到你的日历应用

## 适用说明

- 当前项目面向 Miley's English Club 的微信约课流程
- `localhost` 或本地局域网地址仅适合开发和验证，不能直接用于 Google Calendar 等外部日历订阅
- 日历刷新频率由日历应用控制，通常不是实时同步
- 订阅链接应视为私密链接，不建议公开分享

## 本地开发

环境要求：

- Node.js 20+
- pnpm

启动方式：

```bash
pnpm install
pnpm build
pnpm preview
```

默认本地地址：

```text
http://127.0.0.1:4173
```

## 部署

项目已按 Netlify 部署方式组织，可直接用于静态站点加 Functions 的发布流程。

部署前请至少确认：

- 已配置环境变量 `SUBSCRIPTION_SECRET`
- 部署地址可通过公开 HTTPS 访问

更详细的部署步骤见 [`docs/netlify.md`](./docs/netlify.md)。

## 相关文档

- [Google Calendar 订阅指南](./docs/google-calendar.md)
- [Netlify 部署指南](./docs/netlify.md)
- [架构说明](./docs/architecture.md)
