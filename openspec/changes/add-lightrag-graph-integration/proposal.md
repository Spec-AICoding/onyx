# Add LightRAG Graph Integration (Knowledge Governance Menu + /rag Page)

## Summary

Host the LightRAG magicbox knowledge-graph view inside the Onyx magicbox-web as an iframe, giving users a single entry point with unified login. Deliverables:

1. **`/rag` page** — a full-screen iframe shell loading the LightRAG magicbox webui in its embed mode (`/lightrag-ui/?embed=1&tab=knowledge-graph`), with optional `?doc=<link>` / `?connector=` / `?connectorName=` params forwarded to deep-link into a specific document's subgraph.
2. **"Knowledge Governance" sidebar section** — a new flat `SidebarLayouts.Section` under the app sidebar, visible only to admins (`hasAdminAccess`), containing a single "Knowledge Graph" `SidebarTab` pointing at `/rag`. Menu labels follow the existing sidebar style (English, hardcoded), consistent with `New Session` / `Admin Panel`.
3. **API proxying** — Next.js `rewrites` so the iframe's API calls stay same-origin: `/lightrag-api/*` → LightRAG server (9621), `/magicbox/*` → magicbox backend (9622). The LightRAG webui `dist/` is copied into Onyx `public/lightrag-ui/` so Next serves it as static assets (no extra server).
4. **Document linkage** — a "View in Knowledge Graph" action on document surfaces (search results / knowledge base / sync-file document list) that navigates to `/rag?doc=<link>`; the Onyx document `link` equals the LightRAG `biz_id`, so the graph opens on exactly that document's subgraph.

The LightRAG side is a separate change (`embed-graph-viewer-in-onyx` in the LightRAG repo) and is a prerequisite: embed mode, URL-param config override, and URL-driven document linkage must land there first (or be developed in parallel).

## Motivation

The user manages connectors/documents in Onyx and analyzes the resulting knowledge graph in LightRAG; today these are two separate apps with two URLs and two logins. Goal: one entry point (Onyx), one login (Onyx session; LightRAG auth disabled by configuration behind the same-origin proxy), and a clickable path from any document to its subgraph under a new admin-only "Knowledge Governance" menu.

## Goals

- `src/app/rag/page.tsx` (new): server page rendering a client `RAGViewer` component — full-height iframe, `src` built from the LightRAG static base + embed params, forwarding `doc` / `connector` / `connectorName` query params; `sandbox` and `referrerPolicy` set conservatively (allow-scripts, allow-same-origin, allow-forms).
- `src/sections/sidebar/AppSidebar.tsx`: new `<SidebarLayouts.Section title="知识治理">` wrapped in `{hasAdminAccess && ...}`, containing `<SidebarTab icon={...} href="/rag">知识图谱</SidebarTab>`; follows the existing flat-section pattern (Agents / Projects / Recents) — no new collapsible interaction.
- `useAppFocus` (in `src/sections/sidebar/ChatButton.tsx`): recognize the `/rag` path so the sidebar item shows the active state.
- `next.config.js`: two new `rewrites` — `/lightrag-api/:path*` → `http://127.0.0.1:9621/:path*`, `/magicbox/:path*` → `http://127.0.0.1:9622/:path*` (existing 8090 rewrites untouched).
- Static hosting: copy LightRAG webui `dist/` → `public/lightrag-ui/` (scripted; `base: './'` in the Vite build makes relative asset URLs work).
- Document surfaces: add "View in Knowledge Graph" to the document display components (exact mount points to be located during implementation — candidates: search result cards, knowledge base document list, sync-file document list at `/admin/sync-files/.../documents`).
- Docs: update the magicbox deployment notes with the build/copy step and the rewrites.

## Non-goals

- No code-level merge — the LightRAG webui stays a separate app and bundle; Onyx only embeds it.
- No LightRAG login inside Onyx — LightRAG auth is disabled via its `.env` (configuration, handled by the LightRAG change); this is acceptable for an internal deployment where the LightRAG API is reachable only through the Onyx origin.
- No reverse linkage (graph → Onyx document) and no postMessage control protocol in this change.
- No changes to Onyx core (`backend/onyx/*`) — this change touches `magicbox-web` only.
- No permission model beyond admin visibility of the menu item; document-level ACLs inside the graph remain whatever the LightRAG graph filter provides.
