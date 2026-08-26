"""外部用户组管理只读 API —— 独立 FastAPI 应用。

仅连接 PostgreSQL（只读查询），不 import Onyx 任何代码、不依赖 Redis。
本阶段无用户认证，仅允许绑定回环地址（由 magicbox-web rewrites 服务端代理访问）。
"""
