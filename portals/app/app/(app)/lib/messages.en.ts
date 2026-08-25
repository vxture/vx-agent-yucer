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

  // --- /pipeline ----------------------------------------------------------

  PIPELINE_TEXT: {
    title: "Pipeline",
    descriptionReadOnly:
      "Read-only: you can see the pipeline but hold no permission to move a deal.",
    description:
      "Forecast and snapshot are computed by the same rule, so they cannot disagree.",
    columnOpportunity: "Opportunity",
    columnStage: "Stage",
    columnForecast: "Forecast",
    columnAmount: "Amount",
    columnProbability: "Win rate",
    columnExpectedClose: "Expected close",
    probabilityOverridden: (value: number) => `${value}% set by hand`,
    probabilityHintOverridden: (fallback: number) =>
      `Set by hand (the stage default is ${fallback}%)`,
    probabilityHintDefault: "Stage default",
    emptyTitle: "No opportunities yet",
    emptyDescription: "They appear here once a qualified lead is converted.",
    rollupFailedTitle: "Could not roll up",
    rowCount: (n: number) => `${n} deals`,
    openDeal: "Open the deal",
    periodLabel: "Period",
    splitCollapse: "Collapse the split",
    splitExpand: "Expand the split",
    splitEmpty: "Nothing to split by product line this period",
    trajectoryWindow: (shown: number, total: number) =>
      `last ${shown} of ${total}`,
    trajectoryEmptyTitle: "No forecast snapshot this period yet",
    trajectoryEmptyDescription:
      "Submit a forecast and its changes appear here over time. The trajectory draws only snapshots that were saved; it never reconstructs them.",
    lead: (commit: string) => `${commit} committed this quarter`,
    leadDelta: (delta: string, since: number) =>
      `${delta} against the forecast ${since} days ago`,
    leadFlat: "Unchanged since the last forecast",
    leadNoHistory: "No forecast recorded this period",
    periodOf: (p: string) => `${p} basis`,
    trajectory: "Forecast trajectory",
    trajectoryWhy:
      "Snapshots are append-only. Forecast accuracy is the period's actual against its opening snapshot, and one missing point makes it uncomputable.",
    tCommit: "Commit",
    tBestCase: "Best case",
    tPipeline: "Pipeline",
    tClosed: "Closed",
    productSplit: "What the commit is made of",
    productSplitWhy:
      "Split by product line. A single total cannot say what the money is for.",
    needsApproval: "Discount pending approval",
    noLines: "No product lines yet",
  },

  STAGE_LABEL: {
    qualify: "Qualify",
    discover: "Discover",
    validate: "Validate",
    propose: "Propose",
    negotiate: "Negotiate",
    won: "Won",
    lost: "Lost",
  },

  FORECAST_LABEL: {
    pipeline: "Pipeline",
    best_case: "Best case",
    commit: "Commit",
    closed: "Closed",
  },

  // PARTIAL OVERRIDE, and the pattern is worth naming because it will recur.
  // Spreading the Chinese constant inside gives per-KEY granularity, so a
  // dictionary does not have to be translated all-or-nothing. BOARD_TEXT
  // belongs to the left board and arrives with its own slice; `wan` is pulled
  // forward because it leaks onto /pipeline's headline.
  //
  // A COMPACT NUMBER IS LOCALE-SPECIFIC, which is why it lives in a dictionary
  // at all: Chinese groups by 万 (10^4), English by thousands. 4,200,000 is
  // "420 万" and "4.2M" - not a translation of a word but a different way of
  // cutting the number, and hardcoding either produces figures the reader has
  // to convert in their head.
  BOARD_TEXT: {
    ...zh.BOARD_TEXT,
    wan: (amount: number) =>
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount),
  },

  // --- /account -----------------------------------------------------------

  ACCOUNT_TEXT: {
    title: "Accounts",
    lead: (n: number) => `${n} accounts`,
    leadOverdue: (n: number) => `${n} promises are overdue - clear those first`,
    leadAtRisk: (n: number) => `${n} below 60 health, sorted to the top`,
    leadOrder:
      "Ordered by health, sickest first. Never assessed sorts last - that is not the same as unhealthy.",
    description:
      "Health is derived and recomputed from source data. It orders and warns; it is never the sole basis for a business judgement.",
    columnName: "Account",
    columnIndustry: "Industry",
    columnOwner: "Owner",
    columnHealth: "Health",
    columnStatus: "Status",
    unscored: "Not assessed",
    emptyTitle: "No accounts yet",
    emptyDescription:
      "They appear here once a lead converts or one is entered by hand.",
    rowCount: (n: number) => `${n} accounts`,
    openAccount: "Open the account",
    recompute: "Recompute health",
    recomputeHint:
      "Recomputes from current source data and writes the result back",
    recomputeDenied: "No permission to recompute health",
    recomputedTitle: "Health recomputed",
    recomputedOn: (name: string, score: number | null) =>
      score === null
        ? `${name}: not enough data, still unassessed`
        : `${name}: ${score}`,
    recomputeFailed: "Could not recompute",
    ownerNone: "Unassigned",
  },

  ACCOUNT_STATUS_LABEL: {
    prospect: "Prospect",
    active: "Active",
    dormant: "Dormant",
    churned: "Churned",
  },

  // --- /campaign ----------------------------------------------------------

  CAMPAIGN_TEXT: {
    title: "Campaigns",
    description:
      "A campaign is the anchor attribution hangs on. Return counts won revenue, never pipeline - unclosed pipeline has returned nothing yet.",
    lead: (n: number) => `${n} campaigns`,
    leadSpend: (budget: string, won: string) =>
      `${budget} budget - ${won} returned`,
    leadRule:
      "Return counts won revenue only. Pipeline is not return - money that has not closed is not money.",
    rowCount: (n: number) => `${n} campaigns`,
    columnName: "Campaign",
    columnChannel: "Channel",
    columnBudget: "Budget",
    columnProgress: "Progress",
    columnStatus: "Status",
    columnReturn: "Return",
    emptyTitle: "No campaigns yet",
    emptyDescription: "Turn a strategy and a segment into concrete outreach.",
    progress: (done: number, total: number, skipped: number) =>
      skipped > 0
        ? `${done}/${total} done (${skipped} skipped)`
        : `${done}/${total} done`,
  },

  CAMPAIGN_STATUS_LABEL: {
    draft: "Draft",
    scheduled: "Scheduled",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    cancelled: "Cancelled",
  },

  // --- /delivery ----------------------------------------------------------

  DELIVERY_TEXT: {
    title: "Delivery",
    description:
      "The chain does not end at a win, it ends when the money arrives. A project with an overdue instalment may not show as healthy.",
    lead: (n: number) => `${n} delivery projects`,
    leadContract: (total: string) => `${total} under contract`,
    leadDowngraded: (n: number) =>
      `${n} projects have been downgraded - delivery says fine, but the money has not arrived.`,
    leadRule:
      "Health shows the DERIVED value, not what the delivery team reported. An overdue instalment may not show as healthy.",
    rowCount: (n: number) => `${n} projects`,
    managerNone: "Unassigned",
    columnName: "Project",
    columnAccount: "Account",
    columnManager: "Manager",
    columnHealth: "Health",
    columnContract: "Contract",
    columnStatus: "Status",
    healthOverridden: "Downgraded",
    healthOverriddenWhy:
      "Delivery reported healthy. The rule does not accept it: a project with unpaid overdue instalments may not show as healthy.",
    healthOverriddenEvidence: "Basis",
    emptyTitle: "No delivery projects yet",
    emptyDescription:
      "A won opportunity becomes a delivery project and appears here.",
  },

  PROJECT_STATUS_LABEL: {
    planning: "Planning",
    active: "Active",
    on_hold: "On hold",
    delivered: "Delivered",
    closed: "Closed",
    cancelled: "Cancelled",
  },

  PROJECT_HEALTH_LABEL: {
    green: "Healthy",
    amber: "Watch",
    red: "At risk",
  },

  LIFECYCLE_TEXT: {
    moveTo: "Move to",
    apply: "Apply",
  },

  LIFECYCLE_ERROR: {
    illegal_transition: "This status cannot move directly to that one",
    unknown_status: "Unknown status",
    executions_outstanding:
      "Executions are still outstanding; finish or skip them before ending the campaign",
    invalid_window: "The campaign's start and end dates are not valid",
    not_found: "No such record, or it does not belong to this workspace",
    not_authenticated: "Your session has expired; sign in again",
    permission_denied: "You hold no permission for this action",
    feature_not_in_tier: "This tier does not include that capability",
    no_data_access: "This workspace has no access",
  },

  // PARTIAL. FIELD_TEXT belongs to the account detail page and arrives with it;
  // these keys are pulled forward because the overdue block renders on /account.
  FIELD_TEXT: {
    ...zh.FIELD_TEXT,
    commitCount: (n: number) => `${n}`,
    commitDaysOverdue: (n: number) => `${n} days overdue`,
    commitDueOn: (d: string) => `was due ${d}`,
    commitGoSettle: "Go settle",
    commitGoSettleHint: (name: string) =>
      `Open ${name} and deal with this promise`,
    commitOverdueDescription:
      "Promises past their date that nobody has faced yet. A customer missing promises in a row is the earliest sign of a stall.",
    commitOverdueEmpty: "No overdue promises",
    commitOverdueEmptyDescription:
      "Every recorded promise is still within its date.",
    commitOverdueTitle: "Overdue promises",
    commitOwner: (who: string) => `owner ${who}`,
    commitOwnerNone: "No owner assigned",
  },

  DIRECTION_LABEL: {
    we_owe: "We promised",
    they_owe: "They promised",
  },
};
