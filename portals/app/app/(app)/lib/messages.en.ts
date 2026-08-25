import type { Dictionary } from "./i18n/dictionary";
import * as zh from "./messages";

// The en-US dictionary.
//
// IT SPREADS zh AND OVERRIDES. Every key not listed below is still Chinese, on
// purpose and visibly: an English reader meeting a Chinese string learns that
// this page has not been translated yet, which is true. The alternative -
// stubbing every key with a machine rendering - would hide the same fact behind
// text that reads as finished.
//
// Each override is TYPE-CHECKED against its Chinese counterpart, so a renamed
// key breaks the build and a function cannot quietly change its arity.
//
// TRANSLATED SO FAR: the shell chrome - what surrounds every page. Page
// dictionaries follow. `grep -c "^  [A-Z_]*:" ` against this file counts what
// is done; the 61 constants in messages.ts are the denominator.

export const en: Dictionary = {
  ...(zh as unknown as Dictionary),

  SHELL_TEXT: {
    brandName: "Yucer Sales Agent",
    workspaceFallback: "Current workspace",
    signedOutTitle: "Not signed in",
    signedOutDescription:
      "Sign in with your Vxture account to use this product.",
    noAccessTitle: "This workspace has no yucer subscription",
    noAccessDescription:
      "Subscribing unlocks accounts, the deal pipeline and the sales copilot.",
    subscribeCta: "Subscribe",
    noRolesTitle: "No role has been assigned to you yet",
    noRolesDescription:
      "The workspace is subscribed, but you hold no role, so nothing is visible to you yet. Ask a workspace administrator to assign one.",
    loadFailed: "Could not load the data",
  },

  NAV_TEXT: {
    ariaLabel: "Capability domains",
    groupWork: "Workbench",
    groupChain: "Records",
    groupAgent: "Copilot",
    groupAdmin: "Administration",
    requiresTier: (tier: string) => `Requires the ${tier} tier`,
    notSubscribed: "This workspace has no subscription to this product",
    upgradeCta: "Upgrade to unlock more",
  },

  DOMAIN_LABEL: {
    strategy: "Market strategy",
    planning: "Sales planning",
    campaign: "Campaigns",
    account: "Accounts",
    signal: "Signal inbox",
    pipeline: "Pipeline",
    delivery: "Delivery",
    copilot: "Copilot",
    home: "Today's calls",
    queue: "Awaiting me",
    admin: "Members and roles",
    adoption: "Adoption",
  },

  HEADER_TEXT: {
    searchPlaceholder: "Search accounts, deals, notes",
    searchEmpty: "Nothing matched",
    searchLoading: "Searching",
    searchResults: "Search results",
    groupAccounts: "Accounts",
    groupDeals: "Deals",

    subscription: (tier: string) => tier,
    subscriptionNone: "No subscription",
    subscriptionAria: "Subscription tier",
    version: (v: string) => v,

    scopeAria: (domain: string) => `Domain: ${domain}`,
    scopeAriaUnknown: "Domain",

    workspaceAria: "Current workspace and tenant",
    workspacePanelTitle: "Workspace",
    workspaceLabel: "Workspace",
    tenantLabel: "Tenant",
    tenantUnknown: "Not identified",
    workspaceSwitchHint:
      "Workspace and tenant are fixed at sign-in. Sign in again to change them.",

    toolsAria: "Shell tools",
    fullscreen: "Full screen",
    fullscreenExit: "Exit full screen",
    help: "Help",
    notifications: "Notifications",
    notificationsWithCount: (n: number) => `Notifications, ${n} unread`,
    settings: "Settings",

    adminAria: "Administration",
    userMenuOpen: "Open the user menu",
    boardOpen: "Show the board",
    boardClose: "Hide the board",
    agentDock: "Copilot",
    agentDockWithCount: (n: number) => `Copilot, ${n} awaiting your call`,
    countOverflow: "99+",

    prefTitle: "Preferences",
    prefLocale: "Language",
    prefTheme: "Theme",
    prefThemeLight: "Light",
    prefThemeDark: "Dark",
    prefThemeSystem: "System",
    prefDensity: "Density",
    prefDensityCompact: "Compact",
    prefDensityDefault: "Default",
    prefDensityComfortable: "Comfortable",
    prefFontSize: "Text size",
    prefFontSmall: "Small",
    prefFontDefault: "Default",
    prefFontLarge: "Large",
    logoAlt: "Vxture",
  },

  ADMIN_TEXT: {
    title: "Administration",
    description:
      "Workspace settings. Not daily work, so it does not take sidebar room - it is reached from the top right.",
    emptyTitle: "You hold no administration permission",
    emptyDescription:
      "This is not a subscription tier problem and money will not fix it. An administrator has to assign you a role.",
    entryHint: {
      admin: "Who can enter this workspace, and what each of them may do",
      adoption:
        "Whether follow-up notes are actually being used. Criteria in ADR-012",
    },
    memberCount: (members: number, roles: number) =>
      `${members} members - ${roles} roles in use`,
    memberNone: "No members yet - they appear after their first sign-in",
    memberNoRead: "No permission to read members",
    adoptionCriterion: (weeks: number, judge: number) =>
      `Judged over the last ${weeks} weeks; ${judge} consecutive weeks at target counts as adopted`,
    open: "Open",
  },
  // --- /signal ------------------------------------------------------------

  SIGNAL_TEXT: {
    title: "Signal inbox",
    description:
      "Opportunities found without waiting for a rep to type one in. A higher score is worth reading first.",
    columnSubject: "Signal",
    columnType: "Type",
    columnScore: "Score",
    columnAccount: "Matched account",
    columnDetected: "Found",
    columnStatus: "Status",
    unmatchedAccount: "New logo",
    unscored: "Unscored",
    emptyTitle: "The inbox is empty",
    emptyDescription:
      "Once an external signal source is connected, what it finds appears here; signals can also be entered by hand.",
    promote: "Promote to lead",
    dismiss: "Dismiss",
    markDuplicate: "Mark duplicate",
    rescore: "Rescore",
    scoreExplain: (base: number, decay: number, bonus: number) =>
      `type weight ${base} x recency ${decay.toFixed(2)} + match bonus ${bonus}`,

    lead: (n: number) => `${n} signals awaiting your call`,
    leadNamed: (n: number) => `${n} of them from named accounts`,
    leadNone: "Nothing awaiting a call",

    groupNamed: "Named accounts",
    groupNamedWhy:
      "Companies on the strategic account list, watched for tenders, hires and investment.",
    groupDomain: "Product domains",
    groupDomainWhy:
      "The kinds of deal our product covers. New logos come in through this line.",
    groupNone: "Untargeted",
    groupNoneWhy:
      "Signals from before targeted discovery. Left as they are, never backfilled.",

    breakdown: "Score breakdown",
    bdBase: "Type weight",
    bdDecay: "Recency",
    bdBonus: "Match bonus",
    bdAge: "Days old",
    stale: "Score is stale",
    staleCount: (n: number) => `${n} scores are stale; rescoring realigns them`,
    staleWhy: (stored: number, now: number) =>
      `Stored at ${stored}; recomputed against today's recency it is ${now}. Scores decay over time, and rescoring realigns them.`,
    detectedOn: (d: string, src: string) => `Found ${d} - ${src}`,

    verdictStrong: "Strong",
    verdictWorth: "Worth a look",
    verdictLater: "Can wait",
    verdictUnknown: "Unscored",

    fieldDeadline: (d: string) => `closes ${d}`,
    fieldAmount: (a: string) => `budget ${a}`,
    fieldAge: (n: number) => `${n}d old`,
    fieldDrift: (n: number) => `down ${n}`,

    summaryUnavailable: "No summary could be fetched",
    scoreMethod: "How it was scored",
    expand: "Expand",
    collapse: "Collapse",
    rowMenu: "More actions",
    groupCount: (n: number) => `${n}`,
    noPermission: "No permission to triage",
    noRescorePermission: "No permission to rescore",
  },

  SIGNAL_TYPE_LABEL: {
    tender: "Tender",
    compliance: "Policy",
    intent: "Buying intent",
    hiring: "Hiring",
    funding: "Funding",
    tech_change: "Tech change",
    engagement: "Engagement",
    referral: "Referral",
    other: "Other",
  },

  SIGNAL_STATUS_LABEL: {
    new: "New",
    scored: "Scored",
    promoted: "Promoted",
    dismissed: "Dismissed",
    duplicate: "Duplicate",
  },
  LEAD_TEXT: {
    title: "Leads",
    description:
      "A qualified lead becomes an opportunity. At that moment the source campaign is copied onto the opportunity and frozen - attribution is not filled in afterwards.",
    columnCompany: "Company",
    columnScore: "Score",
    columnSource: "Source",
    columnOwner: "Owner",
    columnStatus: "Status",
    sourceCampaign: "Campaign",
    sourceSignalCampaign: "Signal's campaign",
    sourceSelf: "Self-sourced",
    qualify: "Mark qualified",
    disqualify: "Disqualify",
    disqualifyConsequence:
      "Every action on this lead greys out afterwards, and it cannot be reversed from this list.",
    disqualifyTarget: (subject: string) => `the lead "${subject}"`,
    convert: "Convert to opportunity",
    converted: "Converted",
    hintTerminal: "This lead is closed; nothing can be done to it",
    hintNoTriage: "No permission to triage leads",
    hintNotQualified: "The lead has not been marked qualified",
    hintAlreadyQualified: "The lead is already marked qualified",
    hintNoConvert: "No permission to convert leads",
    needAccount: "An account has to be matched first",
    emptyTitle: "No leads yet",
    emptyDescription: "Promoted signals appear here.",
  },

  LEAD_STATUS_LABEL: {
    new: "New",
    working: "Working",
    qualified: "Qualified",
    converted: "Converted",
    disqualified: "Disqualified",
  },

  DATA_TABLE_LABELS: {
    expand: "Expand",
    selectAll: "Select all on this page",
    deselectAll: "Clear this page's selection",
    selectRow: "Select this row",
    rowActions: "Actions",
  },
};
