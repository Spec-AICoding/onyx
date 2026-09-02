# Tasks: Add LightRAG Graph Integration

## Prerequisite (LightRAG repo)

- [ ] LightRAG change `embed-graph-viewer-in-onyx` implements: embed mode (`?embed=1&tab=knowledge-graph`), URL-param config override (`apiPrefix`/`magicboxPrefix`), `?doc=` document linkage, and `AUTH_ACCOUNTS` commented out in its `.env` (server restarted, `/auth-status` → `auth_configured: false`)

## `/rag` Page

- [ ] Create `src/app/rag/page.tsx` (server component, delegates to client shell)
- [ ] Create `src/app/rag/RAGViewer.tsx`: full-height iframe; src = `/lightrag-ui/?embed=1&tab=knowledge-graph` + forwarded `doc` / `connector` / `connectorName` params (URL-encoded); sandbox/referrerPolicy/allow attributes per design; loading state
- [ ] Verify `/rag` renders the iframe and forwards params correctly in `next dev`

## Sidebar Menu

- [ ] `AppSidebar.tsx`: add `<SidebarLayouts.Section title="Knowledge Governance">` wrapped in `{hasAdminAccess && ...}` with the `Knowledge Graph` `SidebarTab` (`href="/rag"`), placed after the Recents section; English hardcoded labels consistent with existing sidebar; pick an existing graph-like icon
- [ ] `useAppFocus` (ChatButton.tsx): add `isRag()` pathname matcher; wire into the new SidebarTab's `selected`
- [ ] Verify with an admin account: menu visible, click navigates to `/rag`, active highlight correct; verify with a non-admin account: menu hidden

## Proxying and Static Hosting

- [ ] `next.config.js`: add `/lightrag-api/:path*` → `http://127.0.0.1:9621/:path*` and `/magicbox/:path*` → `http://127.0.0.1:9622/:path*` rewrites
- [ ] Build the LightRAG webui (`bun run build`) and copy `dist/` → `public/lightrag-ui/` (scripted: `scripts/copy-lightrag-webui.sh`)
- [ ] Verify in dev: `/lightrag-ui/` serves the app; `/lightrag-api/...` and `/magicbox/...` proxy through (e.g. curl `/magicbox/health` via the Next origin)
- [ ] Verify iframe end-to-end in dev: `/rag` shows the graph; document filter, expansion, label normalization all work through the proxied APIs

## Document Linkage Buttons

- [ ] Locate document display components: search result cards, knowledge base document lists, sync-file document list (`/admin/sync-files/.../documents`)
- [ ] Add "View in Knowledge Graph" action per document (only when `document.link` present): navigates to `/rag?doc=${encodeURIComponent(link)}`
- [ ] Verify: clicking the action on a JIRA document opens `/rag` with the correct subgraph (e.g. SCRUM-5's 5-node subgraph)

## Deployment Notes

- [ ] Update magicbox deployment notes: build+copy command, required services (9621/9622/8080/8090), auth-off note
- [ ] Decide `public/lightrag-ui/` git policy (committed vs ignored + build step) and document it

## Final Verification

- [ ] `npm run lint` / `tsc` clean on the onyx side
- [ ] Full flow: login → sidebar 知识治理 → 知识图谱 → graph loads; search a document → 在图谱中查看 → correct subgraph; refresh `/rag` keeps state
- [ ] Regression: all existing onyx pages unaffected (rewrites only add new paths; sidebar only adds a section)
