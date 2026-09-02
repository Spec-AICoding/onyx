import { Suspense } from "react";

import RAGViewer from "./RAGViewer";

// Knowledge Graph page — embeds the LightRAG graph viewer (served statically
// under /lightrag-ui/) inside an iframe. Suspense is required because the
// viewer reads search params on the client.
export default function RAGPage() {
  return (
    <Suspense fallback={null}>
      <RAGViewer />
    </Suspense>
  );
}
