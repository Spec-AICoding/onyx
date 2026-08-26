"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSettings } from "@/lib/settings/hooks";
import { SidebarLayouts, useSidebarState } from "@opal/layouts";
import { useCustomAnalyticsEnabled } from "@/lib/hooks/useCustomAnalyticsEnabled";
import { useUser } from "@/providers/UserProvider";
import { UserRole } from "@/lib/types";
import { Settings, Tier } from "@/lib/settings/types";
import { tierAtLeast } from "@/lib/tiers";
import { Divider, InputTypeIn, SidebarTab } from "@opal/components";
import { SvgArrowUpCircle, SvgSearch, SvgX } from "@opal/icons";
import {
  useBillingInformation,
  useLicense,
  hasActiveSubscription,
} from "@/lib/billing";
import { ADMIN_ROUTES, sidebarItem } from "@/lib/admin-routes";
import { NEXT_PUBLIC_CLOUD_ENABLED } from "@/lib/constants";
import useFilter from "@/hooks/useFilter";
import { IconFunctionComponent } from "@opal/types";
import AccountPopover from "@/sections/sidebar/AccountPopover";
import { renderSidebarLogo } from "@/lib/sidebar/utils";
import { useShowLogoWhenFolded } from "@/lib/sidebar/hooks";
import { markdown } from "@opal/utils";

const SECTIONS = {
  UNLABELED: null,
  CRAFT: "Craft",
  AGENTS_AND_ACTIONS: "智能体与操作",
  DATA_SOURCES: "数据源",
  DOCUMENTS_AND_KNOWLEDGE: "文档与知识",
  DATA: "数据",
  INTEGRATIONS: "集成",
  PERMISSIONS: "权限",
  ORGANIZATION: "组织",
  USAGE: "用量",
} as const;

interface SidebarItemEntry {
  section: string | null;
  name: string;
  icon: IconFunctionComponent;
  link: string;
  error?: boolean;
  disabled?: boolean;
  requiredTier?: Tier;
}

function buildItems(
  isCurator: boolean,
  enableCloud: boolean,
  tier: Tier | undefined,
  settings: Settings | null,
  customAnalyticsEnabled: boolean,
  hasSubscription: boolean,
  hooksEnabled: boolean
): SidebarItemEntry[] {
  const items: SidebarItemEntry[] = [];

  const add = (
    section: string | null,
    route: Parameters<typeof sidebarItem>[0]
  ) => {
    items.push({ ...sidebarItem(route), section });
  };

  const addGated = (
    section: string | null,
    route: Parameters<typeof sidebarItem>[0],
    requiredTier: Tier
  ) => {
    items.push({
      ...sidebarItem(route),
      section,
      disabled: !tierAtLeast(tier, requiredTier),
      requiredTier,
    });
  };

  // 1. No header — core configuration (admin only)
  if (!isCurator) {
    add(SECTIONS.UNLABELED, ADMIN_ROUTES.LLM_MODELS);
    add(SECTIONS.UNLABELED, ADMIN_ROUTES.WEB_SEARCH);
    add(SECTIONS.UNLABELED, ADMIN_ROUTES.IMAGE_GENERATION);
    add(SECTIONS.UNLABELED, ADMIN_ROUTES.VOICE);
    add(SECTIONS.UNLABELED, ADMIN_ROUTES.CODE_INTERPRETER);
    add(SECTIONS.UNLABELED, ADMIN_ROUTES.CHAT_PREFERENCES);

    if (!enableCloud && customAnalyticsEnabled) {
      addGated(
        SECTIONS.UNLABELED,
        ADMIN_ROUTES.CUSTOM_ANALYTICS,
        Tier.ENTERPRISE
      );
    }
  }

  // 2. Craft (admin only, deployment-gated)
  if (!isCurator && settings?.onyx_craft_available === true) {
    add(SECTIONS.CRAFT, ADMIN_ROUTES.CRAFT_ACCESS);
    add(SECTIONS.CRAFT, ADMIN_ROUTES.CRAFT_APPS);
    add(SECTIONS.CRAFT, ADMIN_ROUTES.CRAFT_INSTRUCTIONS);
  }

  // 3. Agents & Actions
  add(SECTIONS.AGENTS_AND_ACTIONS, ADMIN_ROUTES.AGENTS);
  add(SECTIONS.AGENTS_AND_ACTIONS, ADMIN_ROUTES.MCP_ACTIONS);
  add(SECTIONS.AGENTS_AND_ACTIONS, ADMIN_ROUTES.OPENAPI_ACTIONS);

  // 4. Data Sources
  add(SECTIONS.DATA_SOURCES, ADMIN_ROUTES.INDEXING_STATUS);
  add(SECTIONS.DATA_SOURCES, ADMIN_ROUTES.ADD_CONNECTOR);

  // 5. Documents & Knowledge
  // Shown even in Lite mode; the pages themselves render a no-indexing notice.
  add(SECTIONS.DOCUMENTS_AND_KNOWLEDGE, ADMIN_ROUTES.DOCUMENT_SETS);
  if (!isCurator) {
    items.push({
      ...sidebarItem(ADMIN_ROUTES.INDEX_SETTINGS),
      section: SECTIONS.DOCUMENTS_AND_KNOWLEDGE,
      error: settings?.needs_reindexing,
    });
  }

  // 6. Data（同步数据查看，admin only）
  if (!isCurator) {
    add(SECTIONS.DATA, ADMIN_ROUTES.SYNC_FILES);
  }

  // 7. Integrations (admin only)
  if (!isCurator) {
    addGated(SECTIONS.INTEGRATIONS, ADMIN_ROUTES.API_KEYS, Tier.BUSINESS);
    add(SECTIONS.INTEGRATIONS, ADMIN_ROUTES.SLACK_BOTS);
    add(SECTIONS.INTEGRATIONS, ADMIN_ROUTES.DISCORD_BOTS);
    if (hooksEnabled) {
      addGated(SECTIONS.INTEGRATIONS, ADMIN_ROUTES.HOOKS, Tier.ENTERPRISE);
    }
  }

  // 7. Permissions
  if (!isCurator) {
    add(SECTIONS.PERMISSIONS, ADMIN_ROUTES.USERS);
    addGated(SECTIONS.PERMISSIONS, ADMIN_ROUTES.GROUPS, Tier.BUSINESS);
    add(SECTIONS.PERMISSIONS, ADMIN_ROUTES.EXTERNAL_USER_GROUPS);
    addGated(SECTIONS.PERMISSIONS, ADMIN_ROUTES.SCIM, Tier.ENTERPRISE);
  } else if (tierAtLeast(tier, Tier.BUSINESS)) {
    add(SECTIONS.PERMISSIONS, ADMIN_ROUTES.GROUPS);
  }

  // 8. Usage (admin only)
  if (!isCurator) {
    // Tracing config is not supported on multi-tenant cloud.
    if (!enableCloud) {
      add(SECTIONS.USAGE, ADMIN_ROUTES.TRACING);
    }
    addGated(SECTIONS.USAGE, ADMIN_ROUTES.USAGE, Tier.BUSINESS);
    addGated(SECTIONS.USAGE, ADMIN_ROUTES.TOKEN_RATE_LIMITS, Tier.ENTERPRISE);
    if (
      settings?.query_history_type !== "disabled" &&
      !settings?.hide_query_history_from_admin_panel
    ) {
      addGated(SECTIONS.USAGE, ADMIN_ROUTES.QUERY_HISTORY, Tier.BUSINESS);
    }
    // Log export reads container-local log files; not applicable on
    // multi-tenant cloud.
    if (!enableCloud) {
      addGated(SECTIONS.USAGE, ADMIN_ROUTES.EXPORT_LOGS, Tier.ENTERPRISE);
    }
  }

  // 9. Organization (admin only)
  if (!isCurator) {
    addGated(SECTIONS.ORGANIZATION, ADMIN_ROUTES.THEME, Tier.BUSINESS);
    add(SECTIONS.ORGANIZATION, ADMIN_ROUTES.SECURITY_HARDENING);
    add(SECTIONS.ORGANIZATION, ADMIN_ROUTES.SSO_PROVIDERS);
    if (hasSubscription) {
      add(SECTIONS.ORGANIZATION, ADMIN_ROUTES.BILLING);
    }
  }

  // 9. Upgrade Plan (admin only, no subscription)
  if (!isCurator && !hasSubscription) {
    items.push({
      section: SECTIONS.UNLABELED,
      name: "升级套餐",
      icon: SvgArrowUpCircle,
      link: ADMIN_ROUTES.BILLING.path,
    });
  }

  return items;
}

/** Preserve section ordering while grouping consecutive items by section. */
function groupBySection(items: SidebarItemEntry[]) {
  const groups: { section: string | null; items: SidebarItemEntry[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) {
      last.items.push(item);
    } else {
      groups.push({ section: item.section, items: [item] });
    }
  }
  return groups;
}

export default function AdminSidebar() {
  const { folded, setFolded } = useSidebarState();
  const showLogoWhenFolded = useShowLogoWhenFolded();
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusSearch, setFocusSearch] = useState(false);

  useEffect(() => {
    if (focusSearch && !folded && searchRef.current) {
      searchRef.current.focus();
      setFocusSearch(false);
    }
  }, [focusSearch, folded]);
  const pathname = usePathname();
  const { customAnalyticsEnabled } = useCustomAnalyticsEnabled();
  const { user } = useUser();
  const settings = useSettings();
  const tier = settings?.tier;
  const { data: billingData, isLoading: billingLoading } =
    useBillingInformation();
  const { data: licenseData, isLoading: licenseLoading } = useLicense();
  const isCurator =
    user?.role === UserRole.CURATOR || user?.role === UserRole.GLOBAL_CURATOR;
  // Default to true while loading to avoid flashing "Upgrade Plan"
  const hasSubscriptionOrLicense =
    billingLoading || licenseLoading
      ? true
      : Boolean(
          (billingData && hasActiveSubscription(billingData)) ||
          licenseData?.has_license
        );
  // Hooks are ENTERPRISE-only and only available for self-hosted single-tenant.
  const hooksEnabled =
    tierAtLeast(tier, Tier.ENTERPRISE) && (settings?.hooks_enabled ?? false);

  const allItems = buildItems(
    isCurator,
    NEXT_PUBLIC_CLOUD_ENABLED,
    tier,
    settings,
    customAnalyticsEnabled,
    hasSubscriptionOrLicense,
    hooksEnabled
  );

  const itemExtractor = useCallback((item: SidebarItemEntry) => item.name, []);

  const { query, setQuery, filtered } = useFilter(allItems, itemExtractor);

  const enabled = filtered.filter((item) => !item.disabled);
  const disabled = filtered.filter((item) => item.disabled);
  const enabledGroups = groupBySection(enabled);
  const disabledGroups = groupBySection(disabled);

  return (
    <SidebarLayouts.Root>
      <SidebarLayouts.Header
        renderAppLogo={renderSidebarLogo}
        showLogoWhenFolded={showLogoWhenFolded}
      >
        {folded ? (
          <SidebarTab
            icon={SvgSearch}
            folded
            onClick={() => {
              setFolded(false);
              setFocusSearch(true);
            }}
          >
            搜索
          </SidebarTab>
        ) : (
          <InputTypeIn
            ref={searchRef}
            variant="internal"
            searchIcon
            placeholder="搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            clearButton
          />
        )}
      </SidebarLayouts.Header>

      <SidebarLayouts.Body scrollKey="admin-sidebar">
        {enabledGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            <SidebarLayouts.Section title={group.section ?? undefined}>
              {group.items.map(({ link, icon, name }) => (
                <SidebarTab
                  key={link}
                  icon={icon}
                  href={link}
                  selected={pathname.startsWith(link)}
                >
                  {name}
                </SidebarTab>
              ))}
            </SidebarLayouts.Section>
          </React.Fragment>
        ))}

        {disabledGroups.length > 0 && (
          <>
            <Divider paddingPerpendicular="fit" />
            {/* Empty div here just to add spacing (via the `gap` property on `SidebarLayouts.Body`) */}
            <div />
          </>
        )}
        {disabledGroups.map((group, groupIndex) => (
          <React.Fragment key={`disabled-${groupIndex}`}>
            <SidebarLayouts.Section title={group.section ?? undefined} disabled>
              {group.items.map(({ link, icon, name, requiredTier }) => (
                <SidebarTab
                  key={link}
                  disabled
                  icon={icon}
                  tooltip={markdown(
                    requiredTier === Tier.ENTERPRISE
                      ? "此功能仅在 [MagicBox 企业版](/admin/billing) 中可用。"
                      : "此功能仅在 [MagicBox 商业版或企业版](/admin/billing) 中可用。"
                  )}
                >
                  {name}
                </SidebarTab>
              ))}
            </SidebarLayouts.Section>
          </React.Fragment>
        ))}
      </SidebarLayouts.Body>

      <SidebarLayouts.Footer>
        {!folded && <Divider paddingPerpendicular="sm" />}
        <SidebarTab
          icon={SvgX}
          href={pathname?.startsWith("/admin/craft") ? "/craft/v1" : "/app"}
          variant="sidebar-light"
          folded={folded}
        >
          退出管理后台
        </SidebarTab>
        <AccountPopover folded={folded} />
      </SidebarLayouts.Footer>
    </SidebarLayouts.Root>
  );
}
