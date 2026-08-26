# Proposal: MagicBox Web — 数据源管理后台

## Summary

在仓库根新建独立 Next.js 应用 `magicbox-web/`，作为与 Onyx 原系统视觉差异化、全中文化的独立前端。首版实现后台"数据源"模块完整链路（已有连接器 + 添加连接器 → 详情 → 动态表单 → OAuth），并保留前台骨架。

## Motivation

需要一个面向中文用户、品牌为 MagicBox 的独立管理界面。与 Onyx 共享后端 API 但前端完全独立，通过 CSS token 覆盖实现品牌蓝主色 + 中文字体栈，建立与 Onyx 墨色风格的明显区隔。

## Scope

- 新建 `magicbox-web/` 独立应用，复用 `web/lib/opal` + `web/lib/shared` 设计系统
- MagicBox 品牌：新 logo（应用层本地组件）、科技蓝主色（indigo/blue）、中文字体栈（PingFang SC / Noto Sans SC）、登录页重设计
- 后台 `/admin` 完整数据源链路：已有连接器（列表）→ 添加连接器（选择）→ 连接器详情（/admin/connector/[ccPairId]）→ 动态配置表单（/admin/connectors/[connector]）→ OAuth 回调
- 自定义侧边栏：一级菜单「数据源」→ 子菜单「已有连接器」「添加连接器」
- 前台 `/app` 骨架：路由结构 + 鉴权流 + Chrome 布局保留，页面中文占位
- 中文化：所有 UI 文案、侧边栏标签、页面标题、错误提示硬编码为中文（无 i18n 框架）
- API 反代：`next.config.js` 将 `/api/*` 重写到后端 `INTERNAL_URL`(8080)

## Non-Goals

- 不修改 `web/` 任何文件
- 不修改 `web/lib/opal` 或 `web/lib/shared` 源代码（纯引用复用）
- 不实现前台聊天功能（骨架占位即可）
- 不引入 i18n 框架
- 不添加其他一级菜单（首版仅「数据源」）
- 不修改后端

## Visual Differentiation Strategy

- 主色：`--theme-primary-*` 从墨色 → 科技蓝（indigo/blue）
- 背景色阶：`--background-tint-*` 微调偏冷灰
- 字体：扩展 `font-family` 加入中文 fallback（PingFang SC, Noto Sans SC）
- 登录页：独立视觉设计（布局/插图/文案调整）
- Logo：MagicBox 新图标替代 SvgOnyxLogo
