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
