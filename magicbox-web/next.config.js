// @ts-check
/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["@onyx-ai/opal", "@onyx-ai/shared"],
  typedRoutes: true,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      // 同步任务列表 API（独立 FastAPI 应用，仅回环可达）—— 需置于其它规则之前
      {
        source: "/api/manage/admin/sync-attempts/:path*",
        destination: "http://127.0.0.1:8090/sync-attempts/:path*",
      },
      // 同步文件列表 API（独立 FastAPI 应用，仅回环可达）—— 需置于其它规则之前
      {
        source: "/api/manage/admin/sync-files/:path*",
        destination: "http://127.0.0.1:8090/sync-files/:path*",
      },
      // 外部用户组管理 API（独立 FastAPI 应用，仅回环可达）—— 需置于其它规则之前
      {
        source: "/api/manage/admin/external-user-groups/:path*",
        destination: "http://127.0.0.1:8090/external-user-groups/:path*",
      },
      // 效果评测：onyx 检索 API（本部署 APP_API_PREFIX 为空，真实路径无 /api 前缀）
      // 置于 catch-all 代理（src/app/api/[...path]）之前拦截，附带同源 Cookie 免鉴权透传
      {
        source: "/api/search/:path*",
        destination: "http://127.0.0.1:8080/search/:path*",
      },
      // 知识图谱嵌入：LightRAG API（lightrag-server）
      {
        source: "/lightrag-api/:path*",
        destination: "http://127.0.0.1:9621/:path*",
      },
      // 知识图谱嵌入：magicbox 图数据后端（Neo4j 子图查询）
      {
        source: "/magicbox/:path*",
        destination: "http://127.0.0.1:9622/:path*",
      },
      // 知识图谱嵌入：onyx gateway 元数据（过滤面板连接器列表）
      {
        source: "/onyx/:path*",
        destination: "http://127.0.0.1:8090/:path*",
      },
      {
        source: "/api/docs",
        destination: `${process.env.INTERNAL_URL || "http://localhost:8080"}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${process.env.INTERNAL_URL || "http://localhost:8080"}/openapi.json`,
      },
    ];
  },
};

module.exports = nextConfig;
