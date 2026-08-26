"use client";

import { Logo } from "@/lib/app/components";
import { useSettings } from "@/lib/settings/hooks";

export default function MagicBoxInitializingLoader() {
  const { appName } = useSettings();

  return (
    <div className="mx-auto my-auto animate-pulse">
      <Logo folded size={96} className="mx-auto mb-3" />
      <p className="text-lg text-text font-semibold">正在加载 {appName}…</p>
    </div>
  );
}
