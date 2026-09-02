"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

// Embedded LightRAG knowledge graph viewer.
//
// The LightRAG webui build is served statically under /lightrag-ui/ (copied
// from lightrag/magicbox/webui dist) and opened in embed mode:
//   ?embed=1&tab=knowledge-graph
// Optional params (doc / connector / connectorName) deep-link into the
// document-filtered subgraph via the viewer's filter-panel prefill.
// Backend calls from inside the iframe use relative prefixes (/lightrag-api,
// /magicbox, /onyx) which next.config.js rewrites to the local services.
// Next.js serves public/ files directly but does not serve directory
// indexes, so the iframe must point at index.html explicitly (a bare
// /lightrag-ui/ path 308-redirects to a 404).
const LIGHTRAG_UI_BASE = "/lightrag-ui/index.html";

export default function RAGViewer() {
  const searchParams = useSearchParams();
  const doc = searchParams.get("doc");
  const connector = searchParams.get("connector");
  const connectorName = searchParams.get("connectorName");

  const src = useMemo(() => {
    const params = new URLSearchParams({ embed: "1", tab: "knowledge-graph" });
    // API calls must go through the onyx /lightrag-api rewrite (9621);
    // otherwise the viewer's default /api prefix would hit the onyx backend.
    params.set("apiPrefix", "/lightrag-api");
    if (doc) params.set("doc", doc);
    if (connector) params.set("connector", connector);
    if (connectorName) params.set("connectorName", connectorName);
    return `${LIGHTRAG_UI_BASE}?${params.toString()}`;
  }, [doc, connector, connectorName]);

  return (
    <iframe
      title="Knowledge Graph"
      src={src}
      className="h-screen w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
