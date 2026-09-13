"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  Checkbox,
  EmptyMessageCard,
  InputTextArea,
  MessageCard,
  Tooltip,
} from "@opal/components";
import { SvgCheck, SvgInfoSmall, SvgNetworkGraph } from "@opal/icons";
import { SettingsLayouts } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import { DefaultDropdown, StringOrNumberOption } from "@/components/Dropdown";
import { searchDocuments } from "@/ee/lib/search/svc";
import {
  GRAPH_MODE_LABELS,
  GRAPH_QUERY_MODES,
  GraphQueryMode,
  GraphQueryParams,
  GraphQueryResult,
  runGraphQuery,
} from "@/ee/lib/search/graphDebug";
import type { SearchFullResponse } from "@/lib/search/interfaces";
import { ComparisonPanel } from "./ComparisonPanel";
import { GraphRawPanel } from "./GraphRawPanel";
import { OnyxResultList } from "./OnyxResultList";

/**
 * 效果评测 —— 知识治理下的检索效果调试页。
 *
 * 两种模式：
 * - 独立图谱调试：直连 LightRAG（9621），查看图谱通道自身的检索输出；
 * - 联合融合调试：同一查询对 onyx 检索执行 图谱通道开/关 两次，
 *   并平行直连 9621 抓取原始响应，对比图谱通道对融合结果的影响。
 *
 * 参数漂移提示：onyx 内部图谱通道的查询参数由后端 .env 的 GRAPH_API_*
 * 控制；本页的「图谱参数」仅作用于直连 9621 的原始查询，二者可能不同，
 * 页面用 9621 metadata 回显（实际 query_mode / 关键词）帮助核对。
 */

type EvalMode = "standalone" | "joint";

type Slot<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; value: T }
  | null;

interface OnyxTimedResult {
  response: SearchFullResponse;
  durationMs: number;
}

const MODE_OPTIONS: StringOrNumberOption[] = [
  { name: "独立图谱调试", value: "standalone" },
  { name: "联合融合调试", value: "joint" },
];

const MODE_HINTS: Record<EvalMode, string> = {
  standalone:
    "直接对知识图谱执行检索，展示图谱通道自身的命中结果，用于评估图谱检索能力。",
  joint:
    "同一查询分别以图谱通道开启 / 关闭执行两次融合检索，对比图谱通道带来的差异与贡献。",
};

const JOINT_TABS: Array<{ key: string; name: string }> = [
  { key: "graphOn", name: "图谱通道开启" },
  { key: "graphOff", name: "图谱通道关闭" },
  { key: "compare", name: "差异对比" },
  { key: "graphRaw", name: "图谱原始响应" },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function EffectEvalView() {
  const [mode, setMode] = useState<EvalMode>("standalone");
  const [query, setQuery] = useState("");

  // 图谱参数（两种模式共用，仅作用于直连 9621 的原始查询）
  const [graphMode, setGraphMode] = useState<GraphQueryMode>("hybrid");
  const [topK, setTopK] = useState(30);
  const [chunkTopK, setChunkTopK] = useState(20);
  const [enableRerank, setEnableRerank] = useState(false);

  // onyx 联合模式选项
  const [numHits, setNumHits] = useState(30);
  const [includeContent, setIncludeContent] = useState(true);

  // 执行状态（按请求通道独立保存，便于各 Tab 独立呈现）
  const [standaloneSlot, setStandaloneSlot] = useState<Slot<GraphQueryResult> | null>(null);
  const [graphOnSlot, setGraphOnSlot] = useState<Slot<OnyxTimedResult> | null>(null);
  const [graphOffSlot, setGraphOffSlot] = useState<Slot<OnyxTimedResult> | null>(null);
  const [graphRawSlot, setGraphRawSlot] = useState<Slot<GraphQueryResult> | null>(null);
  const [running, setRunning] = useState<EvalMode | null>(null);
  const [activeJointTab, setActiveJointTab] = useState("graphOn");

  const abortRef = useRef<AbortController | null>(null);

  const graphParams: GraphQueryParams = {
    mode: graphMode,
    top_k: Math.max(1, topK),
    chunk_top_k: Math.max(1, chunkTopK),
    enable_rerank: enableRerank,
  };

  const cancelAll = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(null);
    setStandaloneSlot(null);
    setGraphOnSlot(null);
    setGraphOffSlot(null);
    setGraphRawSlot(null);
  };

  // 仅清空指定模式的结果，切换模式时保留另一模式已缓存的对照结果
  const clearSlotsFor = (target: EvalMode) => {
    if (target === "standalone") {
      setStandaloneSlot(null);
    } else {
      setGraphOnSlot(null);
      setGraphOffSlot(null);
      setGraphRawSlot(null);
    }
  };

  const switchMode = (nextMode: EvalMode) => {
    if (nextMode === mode) return;
    if (running) {
      // 中止进行中的请求并清空其占用的槽位，另一模式的结果不受影响
      abortRef.current?.abort();
      abortRef.current = null;
      setRunning(null);
      clearSlotsFor(running);
    }
    setMode(nextMode);
    setActiveJointTab("graphOn");
  };

  const runStandalone = async () => {
    const trimmed = query.trim();
    if (!trimmed || running) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning("standalone");
    setStandaloneSlot({ status: "loading" });

    try {
      const result = await runGraphQuery(trimmed, graphParams, controller.signal);
      if (controller.signal.aborted) return;
      setStandaloneSlot({ status: "success", value: result });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStandaloneSlot({ status: "error", message: errorMessage(error) });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(null);
      }
    }
  };

  const runJoint = async () => {
    const trimmed = query.trim();
    if (!trimmed || running) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning("joint");
    setGraphOnSlot({ status: "loading" });
    setGraphOffSlot({ status: "loading" });
    setGraphRawSlot({ status: "loading" });

    const runSearch = async (
      disableGraphSearch: boolean,
      setSlot: (slot: Slot<OnyxTimedResult>) => void
    ) => {
      const startedAt = performance.now();
      try {
        const response = await searchDocuments(trimmed, {
          numHits: Math.max(1, numHits),
          includeContent,
          disableGraphSearch,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setSlot({
          status: "success",
          value: { response, durationMs: performance.now() - startedAt },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSlot({ status: "error", message: errorMessage(error) });
      }
    };

    const runRaw = async () => {
      try {
        const result = await runGraphQuery(trimmed, graphParams, controller.signal);
        if (controller.signal.aborted) return;
        setGraphRawSlot({ status: "success", value: result });
      } catch (error) {
        if (controller.signal.aborted) return;
        setGraphRawSlot({ status: "error", message: errorMessage(error) });
      }
    };

    try {
      await Promise.all([
        runSearch(false, setGraphOnSlot),
        runSearch(true, setGraphOffSlot),
        runRaw(),
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(null);
      }
    }
  };

  const handleRun = () => {
    if (mode === "standalone") {
      void runStandalone();
    } else {
      void runJoint();
    }
  };

  const queryDisabled = query.trim() === "" || running !== null;

  return (
    <SettingsLayouts.Root width="full">
      <SettingsLayouts.Header icon={SvgNetworkGraph} title="效果评测" divider />
      <SettingsLayouts.Body>
        <Section gap={1.5} alignItems="stretch" height="auto">
          {/* 模式切换 */}
          <div className="flex flex-col gap-2">
            <div className="inline-flex w-fit rounded-lg border border-border-01 bg-background-tint-01 p-1">
              {MODE_OPTIONS.map((option) => {
                const selected = mode === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => switchMode(option.value as EvalMode)}
                    className={`flex min-w-36 items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm transition-colors ${
                      selected
                        ? "bg-background font-semibold text-text-01 shadow-sm"
                        : "text-text-04 hover:text-text-03"
                    }`}
                  >
                    {selected && <SvgCheck size={14} className="shrink-0" />}
                    {option.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-text-04">{MODE_HINTS[mode]}</p>
          </div>

          {/* 评测查询 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="eval-query" className="text-sm font-medium text-text-01">
                评测查询
                <span className="ml-0.5 text-status-text-error-05">*</span>
              </label>
              <span className="text-xs text-text-04">Ctrl / Cmd + Enter 快速执行</span>
            </div>
            <InputTextArea
              id="eval-query"
              rows={3}
              autoResize
              maxRows={8}
              placeholder="输入需要评测的查询语句，例如：知识图谱的存储后端如何配置？"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === "Enter" &&
                  !queryDisabled
                ) {
                  handleRun();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              {running ? (
                <Button prominence="secondary" onClick={cancelAll}>
                  取消
                </Button>
              ) : (
                <Button disabled={query.trim() === ""} onClick={handleRun}>
                  {mode === "standalone" ? "图谱检索" : "执行对比检索"}
                </Button>
              )}
            </div>
          </div>

          {/* 图谱检索参数 */}
          <div className="flex flex-col gap-3 rounded-lg border border-border-01 bg-background-tint-00 p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-text-01">图谱检索参数</h3>
              <span className="text-xs text-text-04">
                作用于图谱直连检索；融合检索内部参数由系统后台统一配置
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <ParamField
                label="检索模式"
                tip="图谱检索的查询策略；混合模式融合局部与全局通道，建议默认使用。"
              >
                <div className="w-56">
                  <DefaultDropdown
                    options={GRAPH_QUERY_MODES.map((m) => ({
                      name: GRAPH_MODE_LABELS[m],
                      value: m,
                    }))}
                    selected={graphMode}
                    onSelect={(value) => {
                      if (GRAPH_QUERY_MODES.includes(value as GraphQueryMode)) {
                        setGraphMode(value as GraphQueryMode);
                      }
                    }}
                  />
                </div>
              </ParamField>
              <ParamField
                label="返回实体 / 关系数"
                tip="图谱检索返回的实体与关系数量上限；数值越大召回越全、耗时越长。"
              >
                <NumberInput value={topK} onChange={setTopK} />
              </ParamField>
              <ParamField
                label="返回文本块数"
                tip="图谱检索返回的相关文本块数量上限。"
              >
                <NumberInput value={chunkTopK} onChange={setChunkTopK} />
              </ParamField>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <CheckOption
                checked={enableRerank}
                onCheckedChange={setEnableRerank}
                label="结果重排"
                tip="对候选结果按相关性二次排序；需图谱检索服务已配置重排模型才生效。"
              />
            </div>
          </div>

          {/* 融合检索选项（联合模式） */}
          {mode === "joint" && (
            <div className="flex flex-col gap-3 rounded-lg border border-border-01 bg-background-tint-00 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-sm font-semibold text-text-01">融合检索选项</h3>
                <span className="text-xs text-text-04">
                  两次检索仅图谱通道开关不同，其余条件一致，用于对比其带来的差异
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <ParamField
                  label="返回结果数"
                  tip="单次融合检索返回的文档结果数量。"
                >
                  <NumberInput value={numHits} onChange={setNumHits} />
                </ParamField>
              </div>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <CheckOption
                  checked={includeContent}
                  onCheckedChange={setIncludeContent}
                  label="附带文档内容"
                  tip="返回结果中附带文档正文片段，用于核对匹配依据。"
                />
              </div>
            </div>
          )}

          {/* 结果区 */}
          {mode === "standalone" ? (
            <StandaloneBody slot={standaloneSlot} />
          ) : (
            <JointBody
              activeTab={activeJointTab}
              onTabChange={setActiveJointTab}
              graphOnSlot={graphOnSlot}
              graphOffSlot={graphOffSlot}
              graphRawSlot={graphRawSlot}
            />
          )}
        </Section>
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}

/* 表单组件 */

/** 提示图标：鼠标悬停 / 键盘聚焦时显示说明 */
function InfoTip({ tip }: { tip: string }) {
  return (
    <Tooltip tooltip={tip} side="top" sideOffset={6}>
      <span
        tabIndex={0}
        aria-label="查看说明"
        className="inline-flex cursor-default text-text-04 outline-none transition-colors hover:text-text-03 focus-visible:text-text-03"
      >
        <SvgInfoSmall size={14} />
      </span>
    </Tooltip>
  );
}

/** 参数字段：名称在上、控件在下，名称可携带提示图标 */
function ParamField({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-text-01">
        {label}
        {tip && <InfoTip tip={tip} />}
      </span>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min = 1,
  max = 1000,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        onChange(Number.isNaN(parsed) ? min : parsed);
      }}
      className="h-9 w-28 rounded-md border border-border-01 bg-background px-3 text-sm font-medium text-text-01 outline-none transition-colors focus:border-border-03"
    />
  );
}

function CheckOption({
  checked,
  onCheckedChange,
  label,
  tip,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  tip?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-01">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      {label}
      {tip && <InfoTip tip={tip} />}
    </label>
  );
}

/* 独立模式结果 */

function StandaloneBody({ slot }: { slot: Slot<GraphQueryResult> }) {
  if (slot === null) {
    return (
      <EmptyMessageCard
        sizePreset="main-ui"
        title="尚未执行图谱检索"
        description="输入查询语句后点击「图谱检索」，图谱返回的实体、关系、文本块与回显信息将在此展示。"
      />
    );
  }
  if (slot.status === "loading") {
    return <LoadingNotice text="图谱检索执行中…（需先完成实体与关键词抽取，可能耗时较长）" />;
  }
  if (slot.status === "error") {
    return <MessageCard variant="error" title="图谱检索失败" description={slot.message} />;
  }
  return <GraphRawPanel result={slot.value} />;
}

/* 联合模式结果 */

function JointBody({
  activeTab,
  onTabChange,
  graphOnSlot,
  graphOffSlot,
  graphRawSlot,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  graphOnSlot: Slot<OnyxTimedResult>;
  graphOffSlot: Slot<OnyxTimedResult>;
  graphRawSlot: Slot<GraphQueryResult>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 结果视图切换：下划线式，与顶部模式切换的胶囊样式区分 */}
      <div className="flex gap-1 border-b border-border-01">
        {JOINT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`-mb-px border-b-2 px-3 pb-2 pt-1 text-sm transition-colors ${
              activeTab === tab.key
                ? "border-text-01 font-medium text-text-01"
                : "border-transparent text-text-04 hover:text-text-03"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {activeTab === "graphOn" && (
        <OnyxTabBody
          slot={graphOnSlot}
          emptyHint="尚未执行对比检索"
          loadingText="图谱通道开启侧检索中…"
          render={(value) => (
            <OnyxResultList
              title="图谱通道开启"
              response={value.response}
              durationMs={value.durationMs}
              highlightGraph
            />
          )}
        />
      )}

      {activeTab === "graphOff" && (
        <OnyxTabBody
          slot={graphOffSlot}
          emptyHint="尚未执行对比检索"
          loadingText="图谱通道关闭侧检索中…"
          render={(value) => (
            <OnyxResultList
              title="图谱通道关闭"
              response={value.response}
              durationMs={value.durationMs}
            />
          )}
        />
      )}

      {activeTab === "compare" &&
        (graphOnSlot === null && graphOffSlot === null ? (
          <EmptyMessageCard
            sizePreset="main-ui"
            title="尚未执行对比检索"
            description="执行后按文档标识对齐图谱开 / 关两侧结果，展示独有、共有文档与评分差异。"
          />
        ) : graphOnSlot?.status === "success" && graphOffSlot?.status === "success" ? (
          <ComparisonPanel
            graphOnResponse={graphOnSlot.value.response}
            graphOffResponse={graphOffSlot.value.response}
            graphOnDurationMs={graphOnSlot.value.durationMs}
            graphOffDurationMs={graphOffSlot.value.durationMs}
          />
        ) : graphOnSlot?.status === "loading" || graphOffSlot?.status === "loading" ? (
          <LoadingNotice text="对比检索执行中…" />
        ) : (
          <MessageCard
            variant="error"
            title="差异对比不可用"
            description={
              graphOnSlot?.status === "error"
                ? graphOnSlot.message
                : graphOffSlot?.status === "error"
                  ? graphOffSlot.message
                  : "图谱开 / 关两侧需同时成功才能对比。"
            }
          />
        ))}

      {activeTab === "graphRaw" && (
        <RawTabBody slot={graphRawSlot} emptyHint="尚未执行对比检索" />
      )}
    </div>
  );
}

function OnyxTabBody({
  slot,
  emptyHint,
  loadingText,
  render,
}: {
  slot: Slot<OnyxTimedResult>;
  emptyHint: string;
  loadingText: string;
  render: (value: OnyxTimedResult) => ReactNode;
}) {
  if (slot === null) {
    return <EmptyMessageCard sizePreset="main-ui" title={emptyHint} />;
  }
  if (slot.status === "loading") return <LoadingNotice text={loadingText} />;
  if (slot.status === "error") {
    return <MessageCard variant="error" title="检索失败" description={slot.message} />;
  }
  return render(slot.value);
}

function RawTabBody({ slot, emptyHint }: { slot: Slot<GraphQueryResult>; emptyHint: string }) {
  if (slot === null) {
    return <EmptyMessageCard sizePreset="main-ui" title={emptyHint} />;
  }
  if (slot.status === "loading") {
    return <LoadingNotice text="图谱原始响应获取中…（可能需要先抽取关键词，耗时较长）" />;
  }
  if (slot.status === "error") {
    return <MessageCard variant="error" title="图谱查询失败" description={slot.message} />;
  }
  return <GraphRawPanel result={slot.value} />;
}

function LoadingNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-01 bg-background-tint-00 px-3 py-2 text-sm text-text-04">
      {text}
    </div>
  );
}
