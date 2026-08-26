"use client";

import useSWR from "swr";

import usePaginatedFetch from "@/hooks/usePaginatedFetch";
import { errorHandlingFetcher } from "@/lib/fetcher";

import type { CCPairSyncAttemptsResponse } from "./types";

/**
 * Thin wrapper around `usePaginatedFetch` that adapts the
 * `CCPairSyncAttemptsResponse` shape used by both per-cc-pair sync-attempt
 * endpoints (`/permission-sync-attempts` and
 * `/external-group-sync-attempts`).
 *
 * The standard `usePaginatedFetch` hook expects `{ items, total_items }`,
 * which is a strict subset of `CCPairSyncAttemptsResponse` — so the
 * underlying paginated fetch works against either endpoint without
 * modification, ignoring the extra `applicable` field on the wire.
 *
 * Surfacing `applicable` requires a separate read because
 * `usePaginatedFetch` does not expose the raw response. The applicability
 * value is invariant per (cc_pair, sync_kind), so a single SWR probe with
 * `page_size=1` is the cheapest correct way to read it. SWR's URL-keyed
 * cache shares the result across concurrent renders.
 *
 * @see plans/permission-sync-attempt-tabs.md (PR C, option B)
 */

const ATTEMPTS_REFRESH_INTERVAL_MS = 5000;

interface PaginatedItem {
  id: number | string;
}

export interface UseSyncAttemptsPaginatedFetchConfig {
  /**
   * Base API URL for the sync-attempts endpoint, without query params.
   * E.g. `/api/manage/admin/cc-pair/123/permission-sync-attempts`.
   * Should be sourced from `SWR_KEYS` so that any future `mutate()` callers
   * can target the same key.
   */
  endpoint: string;
  /**
   * SWR cache key for the applicability probe (the `?page_num=0&page_size=1`
   * read). Must be a `SWR_KEYS` entry so that callers wanting to force-refresh
   * the probe can do so without re-deriving the URL inline. See the
   * `ccPair*SyncAttemptsProbe` builders in `web/src/lib/swr-keys.ts`.
   */
  swrProbeKey: string;
  /**
   * Extra query params appended by `usePaginatedFetch` alongside its own
   * `page_num`/`page_size`. Needed by endpoints that require query filters
   * (e.g. `cc_pair_id`), since `usePaginatedFetch` cannot merge a query
   * string that is already part of `endpoint`.
   */
  filter?: Record<string, string | boolean | number | string[] | Date>;
  itemsPerPage: number;
  pagesPerBatch: number;
}

export interface UseSyncAttemptsPaginatedFetchReturn<T extends PaginatedItem> {
  /**
   * `null` while the applicability probe is in flight; `true`/`false`
   * once known. The two non-null values map to "render the table" vs
   * "render the not-applicable message" — they are NOT redundant with
   * `items.length === 0`, see `CCPairSyncAttemptsResponse`.
   */
  applicable: boolean | null;
  /**
   * `applicable=false` 时后端返回的原因码（如 `unsupported_source` /
   * `not_synced`）；适用时为 `null`。
   */
  applicableReason: string | null;
  applicableError: Error | null;
  applicableIsLoading: boolean;

  // Standard pagination state, only meaningful when `applicable === true`.
  // The underlying endpoint short-circuits to `items=[], total_items=0`
  // when not applicable, so reading these in that state is harmless but
  // misleading — gate on `applicable` first.
  currentPageData: T[] | null;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  goToPage: (page: number) => void;
  refresh: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

interface ApplicabilityProbeResponse {
  applicable: boolean;
  reason?: string | null;
}

export default function useSyncAttemptsPaginatedFetch<T extends PaginatedItem>({
  endpoint,
  swrProbeKey,
  filter,
  itemsPerPage,
  pagesPerBatch,
}: UseSyncAttemptsPaginatedFetchConfig): UseSyncAttemptsPaginatedFetchReturn<T> {
  const {
    data: probeData,
    error: probeError,
    isLoading: applicableIsLoading,
  } = useSWR<CCPairSyncAttemptsResponse<T> | ApplicabilityProbeResponse>(
    swrProbeKey,
    errorHandlingFetcher
  );

  const applicable = probeData ? probeData.applicable : null;
  const applicableReason =
    probeData && "reason" in probeData ? (probeData.reason ?? null) : null;

  // Once we know the source has no applicable sync, stop polling — the
  // backend will keep returning `applicable=false, items=[]` every 5s
  // for the rest of the session otherwise.
  const refreshIntervalInMs =
    applicable === false ? 0 : ATTEMPTS_REFRESH_INTERVAL_MS;

  const paginated = usePaginatedFetch<T>({
    endpoint,
    filter,
    itemsPerPage,
    pagesPerBatch,
    refreshIntervalInMs,
  });

  return {
    applicable,
    applicableReason,
    applicableError: (probeError as Error | undefined) ?? null,
    applicableIsLoading,

    currentPageData: paginated.currentPageData,
    currentPage: paginated.currentPage,
    totalPages: paginated.totalPages,
    totalItems: paginated.totalItems,
    goToPage: paginated.goToPage,
    refresh: paginated.refresh,
    isLoading: paginated.isLoading,
    error: paginated.error,
  };
}
