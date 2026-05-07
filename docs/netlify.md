# Netlify 部署指南

本文档只覆盖 Netlify 部署本身。课程订阅的使用方式请见 [Google Calendar 订阅指南](./google-calendar.md)，实现原理请见 [架构说明](./architecture.md)。

## 部署前准备

请先确认以下条件：

- 代码仓库已推送到 GitHub、GitLab 或 Bitbucket
- 已准备好 Netlify 账号
- 生产环境将使用公开可访问的 HTTPS 域名
- 已准备环境变量 `SUBSCRIPTION_SECRET`

`SUBSCRIPTION_SECRET` 用于生成和校验订阅链接，建议使用长度至少 32 字节的随机字符串。

## 项目内已有配置

当前仓库已经包含 Netlify 所需基础配置：

- 构建命令：`pnpm build`
- 发布目录：`.`
- Functions 目录：`netlify/functions`
- 路由转发：`/api/create-subscription`、`/api/get-course`、`/calendar.ics`

相关配置文件见 [`netlify.toml`](../netlify.toml)。

## 配置环境变量

### 在 Netlify 控制台中配置

1. 打开站点设置
2. 进入 `Site configuration -> Environment variables`
3. 新增变量 `SUBSCRIPTION_SECRET`
4. 保存后重新部署

### 使用 Netlify CLI 配置

如果你已经将本地目录与 Netlify 站点关联，可以执行：

```bash
netlify env:set SUBSCRIPTION_SECRET your-random-secret --secret --scope functions
```

## 方案 A：通过 Netlify 控制台部署

1. 登录 [Netlify](https://app.netlify.com/)
2. 点击 `Add new site`
3. 选择 `Import an existing project`
4. 连接代码仓库并选择当前项目
5. 确认 Netlify 读取到仓库中的 `netlify.toml`
6. 检查构建设置

构建设置应为：

```text
Build command: pnpm build
Publish directory: .
```

7. 配置环境变量 `SUBSCRIPTION_SECRET`
8. 开始部署

## 方案 B：通过 Netlify CLI 部署

如果希望从本地发布，可以在项目目录执行：

```bash
pnpm build
netlify deploy
```

正式发布到生产环境：

```bash
netlify deploy --prod
```

如果希望由 Netlify CLI 触发构建，也可以改用：

```bash
netlify deploy --build
netlify deploy --prod --build
```

## 发布后验证

假设站点地址为：

```text
https://your-site-name.netlify.app
```

建议至少验证以下三项：

1. 首页可正常打开
2. 页面可以成功读取课程
3. 页面生成的 `/calendar.ics?token=...` 链接可以返回有效 ICS 内容

如果以上三项都正常，说明静态站点、Functions 和订阅源都已经可用。

## 常见问题

### 1. 页面可以打开，但无法生成订阅链接

优先检查是否已配置 `SUBSCRIPTION_SECRET`，以及变量是否已经应用到最新一次部署。

### 2. 本地测试正常，但部署后行为异常

优先检查：

- Netlify 部署日志
- Functions 日志
- 当前部署是否已经包含最新代码和最新环境变量

### 3. Google Calendar 无法订阅本地地址

`localhost` 或 `127.0.0.1` 只适合本地开发，不能作为对外订阅地址。真正使用时，应从部署后的公开 HTTPS 站点重新生成订阅链接。
