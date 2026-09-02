# Design: Add LightRAG Graph Integration

## 1. `/rag` Page (iframe Shell)

New Next.js app-router page `src/app/rag/page.tsx` (server component) delegating to a client component `src/app/rag/RAGViewer.tsx`:

- Full-height layout: `h-screen` container, iframe fills it; no Onyx page chrome beyond the existing app shell (the app sidebar stays visible so navigation remains possible).
- iframe `src` construction (client-side, from `useSearchParams`):
  ```
  /lightrag-ui/?embed=1&tab=knowledge-graph
    + (&doc=<link> | &connector=<name> | &connectorName=<name>)
  ```
  `doc` / `connector` / `connectorName` are forwarded verbatim from the Onyx URL query. `doc` is URL-encoded (it is an absolute URL itself, e.g. `https://.../browse/SCRUM-5`).
- iframe attributes: `sandbox="allow-scripts allow-same-origin allow-forms"`, `referrerPolicy="no-referrer"`, `allow="clipboard-write"` (graph node copy needs it), `style={{ border: 0, width: '100%', height: '100%' }}`.
- Loading state: skeleton/spinner while the iframe loads (optional `onLoad` state).
- No postMessage protocol in this change — linkage is one-way via URL params; iframe refresh re-applies them (deep-linkable).

## 2. Knowledge Governance Sidebar Section

In `src/sections/sidebar/AppSidebar.tsx`, inside `SidebarLayouts.Body`, after the existing sections (Agents / Projects / Recents):

```tsx
{hasAdminAccess && (
  <SidebarLayouts.Section title="Knowledge Governance">
    <SidebarTab
      icon={SvgChartPieIcon /* pick an existing icon, e.g. a graph-ish one */}
      href="/rag"
      folded={folded}
      selected={activeSidebarTab.isRag()}
    >
      Knowledge Graph
    </SidebarTab>
  </SidebarLayouts.Section>
)}
```

- `hasAdminAccess` comes from the existing `useUser()` hook (already destructured in the component).
- Matches the flat-section pattern exactly (title + flat items, no collapse interaction).
- Menu labels are English and hardcoded, consistent with the existing sidebar (`New Session`, `Admin Panel`, `Agents`, `Projects`, `Recents`) — no i18n plumbing for these two new strings.
- Icon: reuse an existing `Svg*` icon from the sidebar's icon imports (e.g. one resembling a graph/network); no new icon assets in this change.

## 3. Active State (`useAppFocus`)

`useAppFocus` lives in `src/sections/sidebar/ChatButton.tsx` (shared by sidebar components). Add an `isRag()` matcher that returns true when the current pathname starts with `/rag`, mirroring `isNewSession()` / `isMoreAgents()`.

## 4. Proxying and Static Hosting

`next.config.js` `rewrites()` additions (before any catch-all):

```js
// LightRAG API (unauthenticated; reachable only via this same-origin proxy)
{ source: "/lightrag-api/:path*", destination: "http://127.0.0.1:9621/:path*" },
// Magicbox backend (subgraph/entity services)
{ source: "/magicbox/:path*", destination: "http://127.0.0.1:9622/:path*" },
```

Static hosting: LightRAG webui `dist/` (built with relative `base: './'`) copied into `public/lightrag-ui/`. Asset URLs inside `index.html` are `./assets/...`, resolving to `/lightrag-ui/assets/...` — correct under Next's static serving. Add a small script (e.g. `scripts/copy-lightrag-webui.sh`) documenting the copy step; the iframe src `/lightrag-ui/` must serve `index.html` at a URL ending in `/` (Next serves directory index by default; verify).

Dev mode: `next dev` serves `public/` too, and rewrites work — so the whole integration is testable in dev without a LightRAG server beyond the local 9621/9622 processes.

## 5. Document Linkage Buttons

Mount points to locate during implementation (search the codebase for document card/list components):

- Search results: the component rendering search result cards (likely under `src/app/search/` or chat search sections) — add a small icon button/action per result linking to `/rag?doc=<link>`.
- Knowledge base: document list surfaces under admin/knowledge sections if they expose per-document rows.
- Sync-file document list: the page listing documents of a sync file (`/admin/sync-files/.../documents`-style page, backed by the existing 8090 `sync-files/{file_id}/documents` API returning `link` per document).

The button target URL: `/rag?doc=${encodeURIComponent(document.link)}` (link is the biz_id). Only render when `document.link` is present (non-null) — some documents may have no link (e.g. files).

## 6. Deployment Notes Update

Update the magicbox deployment notes (`docs/` in the onyx repo if present, else a README section) with:

- Build + copy: `cd <LightRAG>/magicbox/webui && bun run build && rsync -a dist/ <onyx>/magicbox-web/public/lightrag-ui/`
- Required running services: LightRAG server (9621, unauthenticated), magicbox backend (9622), onyx backend (8080) + gateway (8090)
- Env: `INTERNAL_URL` unchanged; no new env vars strictly required (ports hardcoded in rewrites; consider env-izing if multi-env later)

## 7. Files Touched

- `src/app/rag/page.tsx` — new
- `src/app/rag/RAGViewer.tsx` — new (iframe shell)
- `src/sections/sidebar/AppSidebar.tsx` — knowledge governance section
- `src/sections/sidebar/ChatButton.tsx` — `useAppFocus.isRag()`
- `next.config.js` — 2 rewrites
- `public/lightrag-ui/` — copied build output (git-ignored or committed per team preference)
- `scripts/copy-lightrag-webui.sh` — new helper (optional)
- Document list/card components — linkage buttons (locations TBD during implementation)
