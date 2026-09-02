import { Suspense } from "react";

import RAGViewer from "@/app/rag/RAGViewer";

// Knowledge graph page inside the admin chrome (AdminSidebar entry under
// "知识治理"). Reuses the embedded LightRAG viewer; Suspense is required
// because the viewer reads search params on the client.
export default function AdminRAGPage() {
  return (
    <Suspense fallback={null}>
      <RAGViewer />
    </Suspense>
  );
}
