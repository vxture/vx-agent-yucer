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
// COVERAGE, 2026-08-26: 65 of the 67 constants in messages.ts. The two that
// are not here are PREVIEW_FIXTURES and PREVIEW_TEXT, which belong to
// /product-preview - a fixture page pinned to zh-CN by construction, because a
// reviewer checking the two gates should see the same screen whatever their
// own cookie says. They are demo data, not product copy.
//
// The count is machine-checkable rather than a claim in a comment:
//
//   grep -c "^export \(const\|function\) " messages.ts     <- denominator
//   grep -c "^  [A-Za-z_]*: [{([]"          messages.en.ts   <- numerator
//
// WIRING IS THE OTHER HALF, and it was the half missing until 2026-08-26.
// Sixteen components imported messages.ts directly, so no dictionary lookup
// ever ran in them and adding a translation here changed nothing on screen -
// the detail pages stayed Chinese no matter what this file said. They now go
// through useMessages() / getMessages(). If a page renders Chinese under
// en-US, look for a static import before assuming a missing key.

/**
 * The three codes that come from the GATE rather than from any domain. See the
 * note on GATE_ERROR in messages.ts: `can()` produces exactly these, so every
 * domain dictionary carried its own copy. Spread FIRST, so a domain with
 * something more specific to say still overrides it.
 */
const GATE_ERROR = {
  not_authenticated: "Your session has expired - please sign in again",
  permission_denied: "You cannot perform this action",
  feature_not_in_tier: "Your tier does not include this capability",
} as const;

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

  DOMAIN_LABEL: {
    strategy: "Market strategy",
    planning: "Sales planning",
    campaign: "Campaigns",
    account: "Accounts",
    signal: "Signal inbox",
    segment: "Segments",
    solution: "Solutions",
    pricebook: "Price book",
    territory: "Territories",
    namedAccount: "Named accounts",
    quote: "Quotes",
    routing: "Lead routing",
    winLossReview: "Win/loss reviews",
    collection: "Collections",
    pipeline: "Pipeline",
    delivery: "Delivery",
    copilot: "Copilot",
    catalog: "Catalogue",
    home: "Today's calls",
    queue: "Awaiting me",
    admin: "Members and roles",
    adoption: "Adoption",
    renewal: "Renewals",
    forecastRule: "Forecast rules",
    attainment: "Commitment",
  },

  // The five domain names are the product's loudest claim about itself, so
  // they are translated for STANCE, not word-for-word. 武备 is literally
  // "arms and materiel"; "Armory" carries the same idea in one English word,
  // where "Strategic products" would land back in the CRM register the Chinese
  // deliberately left.
  DOMAIN_GROUP_LABEL: {
    armory: "Armory",
    deployment: "Deployment",
    recon: "Reconnaissance",
    position: "Frontline",
    settlement: "Settlement",
  },

  NAMED_ACCOUNT_TEXT: {
    none: "No named accounts yet",
    noneWhy:
      "Mark an account strategic or key on its own page and it appears here. The tier is set where the evidence for setting it is - health, decision chain and open deals are all on that page.",
  },
  ROUTING_TEXT: {
    title: "Lead routing",
    why:
      "Territory first, then load (owner ruling, 2026-08-30). Territory decides who is allowed to work it; load decides which of them should. Reverse the order and an idle rep gets ground they have never worked.",
    none: "No leads awaiting assignment",
    noneWhy: "Converted and disqualified leads are absent - their ownership is settled.",
    colLead: "Lead",
    colCurrent: "Current owner",
    colSuggested: "Rule suggests",
    colBasis: "Because",
    colApply: "Apply",
    unowned: "unowned",
    alreadyThere: "already there",
    apply: "Assign",
    applied: "Assigned",
    denied: "You do not have permission to assign leads.",
    unroutable: {
      no_region: "no account matched, so no region",
      no_territory: "no territory covers that region",
      no_owner: "the covering territory has no owner",
    } as Record<string, string>,
  },
  RENEWAL_TEXT: {
    title: "Renewals",
    why:
      "Subscription projects appear here 90 days before their term ends (owner ruling, 2026-08-30: derived from the project, and only for subscriptions). One-off deliveries are absent - they finished when they were handed over, and inventing a renewal for one chases an obligation the customer never took on.",
    none: "No subscription terms coming up",
    noneWhy: "One-off projects never renew; a subscription appears 90 days before its term ends.",
    colProject: "Project",
    colEnds: "Term ends",
    colAmount: "Last term",
    colVerdict: "Verdict",
    colOpen: "Action",
    open: "Open deal",
    opened: "Created",
    denied: "You do not have permission to create deals.",
    lapsed: (days: number) => `lapsed ${days} days ago`,
    dueIn: (days: number) => `${days} days left`,
    noEndDate: "no end date",
    risk: {
      low: "delivery on track",
      watch: "delivery at risk - approach carefully",
    } as Record<string, string>,
    notDue: {
      not_subscription: "one-off; it finished when it was delivered",
      no_end_date: "subscription with no end date - this renewal will be missed",
      too_far_out: "outside the 90-day window",
      not_delivering: "not started, or terminated - no term to extend",
      already_renewed: "a renewal deal is already running",
    } as Record<string, string>,
  },
  RENEWAL_ERROR: {
    ...GATE_ERROR,
    renewal_not_due: "This project is not due for renewal - the page may be stale, reload and look again",
    name_required: "a deal needs a name",
    account_required: "a deal needs a customer",
    amount_negative: "a deal amount cannot be negative",
    not_found: "That project does not exist, or is not in this workspace",
  },
  FORECAST_RULE_TEXT: {
    title: "Forecast rules",
    why:
      "Where the rule would file each deal, beside where a person filed it (owner ruling, 2026-08-31: suggest only, applied one deal at a time). The disagreement is what a forecast review is about - and until now it could only be found by reading the board deal by deal.",
    none: "No open deals",
    noneWhy: "Won and lost deals have their category bound to the stage. That is not a judgement, so there is no second opinion to offer.",
    colDeal: "Deal",
    colFiled: "Filed as",
    colSuggested: "Rule says",
    colBasis: "Because",
    colStage: "At stage",
    colApply: "Apply",
    agrees: "agrees",
    apply: "File as this",
    applied: "Filed",
    denied: "You can see the disagreement but cannot change the forecast category - a split the product draws on purpose: you own the deal, not the forecast commitment.",
    basisHuman: (p: number) => `${p}% win rate (theirs)`,
    basisDefault: (p: number) => `${p}% win rate (stage default)`,
    stalledFor: (days: number) => `${days} days, no move`,
    neverMoved: "no stage history",
    cap: {
      no_close_date: "no expected close date - nothing to commit to without a period",
      close_date_passed: "the close date passed and the deal is still open",
      stalled: "sat at this stage too long; one band down",
    } as Record<string, string>,
  },
  FORECAST_RULE_ERROR: {
    ...GATE_ERROR,
    category_settled: "A won or lost deal has its category bound to the stage",
    category_already_agrees: "This deal is already filed where the rule would put it",
    closed_requires_terminal_stage: "The deal is still open and cannot be forecast as closed",
    terminal_requires_closed: "A closed deal can only be forecast as closed",
    unknown_forecast_category: "Unknown forecast category",
    empty_patch: "Nothing was changed",
    not_found: "That deal does not exist, or is not in this workspace",
    probability_range: "Win rate must be a whole number between 0 and 100",
    terminal_probability_fixed: "A closed deal has a fixed win rate and cannot be changed",
    amount_negative: "The amount cannot be negative",
  },
  ATTAINMENT_TEXT: {
    title: "Commitment",
    why:
      "What the period promised, how much has landed, and how much is behind it - three readings that only mean something together. They used to sit on the board as three cards belonging to no module.",
    attained: "attained",
    won: "won",
    target: "target",
    noTarget: "No committed workspace target for this period",
    noTargetWhy:
      "No target is no denominator. Attainment is not zero - it is uncomputable, and rendering it as 0% would report an unset quota as a missed one.",
    pool: (period: string) => `${period} pool`,
    poolWhy:
      "A commitment needs something behind it. This is what is left against the gap, split by confidence - 8.8M of commit and 8.8M of early pipeline are not the same 8.8M.",
    thin: "thin against the gap",
    composition: "What the commitment is made of",
    compositionWhy:
      "Which product lines this money comes from. The same total made of different lines is a different fight.",
    noComposition: "Open deals carry no lines yet, so there is nothing to break down",
  },
  QUOTE_TEXT: {
    title: "Quotes",
    why:
      "What each deal is currently offering. The lines, the floor and the signature all existed; nothing put them together, so \"what did we quote this customer\" meant opening one deal at a time.",
    none: "No quotes yet",
    noneWhy: "Add lines to a deal and its current quote appears here.",
    colDeal: "Deal",
    colAccount: "Account",
    colStage: "Stage",
    colLines: "Lines",
    colAmount: "Quoted",
    colSignature: "Awaiting signature",
    awaiting: (n: number) => `${n} unsigned`,
  },
  DOMAIN_FACT_LABEL: {
    activePlans: "Active plans",
    segments: "Segments",
    emptySegments: "Segments matching nobody",
    products: "Active products",
    solutions: "Solutions",
    unpricedProducts: "Products with no price",
    runningCampaigns: "Running campaigns",
    untriagedSignals: "Signals awaiting triage",
    stalledLeads: "Qualified, not converted",
    activeAccounts: "Active accounts",
    openDeals: "Open deals",
    overdueCommitments: "Overdue commitments",
    pendingReviews: "Deals awaiting review",
  } as Record<string, string>,
  DOMAIN_HOME_TEXT: {
    factsTitle: "Where this domain stands",
    factsWhy:
      "Only what crosses its modules - each of these needs two module pages read against each other, which is the reading nobody does.",
    factsDeniedTitle: "You cannot see this domain's summary",
    factsDeniedWhy:
      "Every figure here goes through the same gate its module page uses. None passed, so nothing is shown.",
    needsAttention: "waiting",
    modulesTitle: "What is in this domain",
    modulesWhy: "Its modules. Built ones open; unbuilt ones say so.",
  },
  DOMAIN_GROUP_QUESTION: {
    armory: "What we fight with",
    deployment: "Who we aim at, and who carries the number",
    recon: "Turning fire into leads",
    position: "How this one is won",
    settlement: "How the money actually arrives",
  },

  PLANNED_MODULE_LABEL: {
    // Trimmed against the Chinese, not translated from it. The column header
    // already says Armory, so "Market segments" spends five characters
    // restating it - and those characters were coming out of the label, which
    // clipped, rather than out of the badge, which did not.
    segment: "Segments",
    catalog: "Catalogue",
    solution: "Solutions",
    pricebook: "Price book",
    territory: "Territories",
    namedAccount: "Key accounts",
    routing: "Lead routing",
    quote: "Quotes",
    winLossReview: "Win/loss",
    collection: "Collections",
  },

  LAUNCHER_TEXT: {
    buttonLabel: "Switch domain",
    panelLabel: "Domains",
    crosscutting: "Across all five",
    // SHORT, and not a stylistic preference. This sits on the right of a row
    // whose left is the module name, in a column roughly 280px wide. The
    // Chinese badge is three characters; "In development" is fourteen, and it
    // pushed every English label into an ellipsis - "Market se...",
    // "Win/loss ..." - so the badge explaining what is missing was the reason
    // you could not read what was missing.
    planned: "Planned",
    section: "On another page",
    locked: "Upgrade",
  },

  // --- detail pages ---------------------------------------------------------
  // Wired 2026-08-26. These 15 constants were already reachable from the
  // account and deal detail pages; what they were not was translated, because
  // those components imported the Chinese module directly and no dictionary
  // lookup ever happened. The import is the half that makes translation
  // possible; this is the half that makes it true.

  // The DS's own English defaults, passed explicitly rather than relied on.
  // The changelog is clear that the fallback exists so a missed prop renders
  // something legible instead of `undefined` - not so anyone can lean on it.
  // Passing them here also means the en-US screen is not a mix of what we said
  // and what the DS guessed, which is the state that makes a missing prop
  // invisible.
  DS_LABELS: {
    confirmTitleTemplate: "{verb} {target}?",
    confirmCancel: "Cancel",
    confirmPending: "Working...",
    actionMenu: "More actions",
    filterReset: "Reset filters",
    filterViewMode: "View mode",
    bulkToolbar: "Bulk actions",
    bulkSelectionTemplate: "{count} {noun} selected",
    toastRegion: "Notifications",
    toastDismiss: "Dismiss notification",
  },

  REVENUE_ERROR: {
    ...GATE_ERROR,
    actual_amount_required: "Settling requires the amount actually received",
    amount_negative: "The amount cannot be negative",
    currency_mismatch: "The currency does not match the plan",
    illegal_transition: "That move is not allowed from here",
    unknown_status: "Unknown status",
    not_found: "No such record, or it belongs to another workspace",
    denied: "Refused",
  },

  ACCOUNT_ERROR: {
    ...GATE_ERROR,
    plan_required:
      "A strategic account needs a plan - the cadence rule reads it, and without one this designation changes nothing",
    period_required: "The plan must name its period",
    cadence_positive: "A cadence of zero days is not a cadence",
    unknown_tier: "Unknown account tier",
    not_found: "No such account, or it belongs to another workspace",
    denied: "Refused",
  },

  CATALOG_ERROR: {
    ...GATE_ERROR,
    code_required: "A code is required",
    name_required: "A name is required",
    unit_required: "A unit is required - a quantity with no unit cannot say what was sold",
    items_required: "A solution with no products is just a name",
    quantity_positive: "The quantity must be above zero",
    duplicate_product: "That product appears twice - use one line with the total",
    product_required: "Pick a product",
    currency_required: "A currency is required",
    amount_negative: "A price cannot be negative",
    floor_above_list:
      "A floor above list would make every sale need approval, which is the same as having no floor",
    denied: "Refused",
  },

  CATALOG_TEXT: {
    solutionSummary: "One-line summary",
    solutionProduct: "Product",
    solutionQuantity: "Quantity",
    pickProduct: "Pick a product",
    addItem: "Add a line",
    removeItem: "Remove",
    saveSolution: "Save solution",
    solutionSaved: "Saved",
    title: "Catalogue",
    description:
      "The catalogue is the dimension every domain references: deals, contracts, delivery and signal matching all read it, and it writes to none of them.",
    lead: (n: number) => `${n} products on sale`,
    leadWhy:
      "You cannot sell anything without knowing what you sell - so the catalogue is not sold by tier and every tier can read it.",
    products: "Products",
    productsWhy:
      "A single product or service. The unit is not decoration: every line multiplies quantity by unit price, and \"10 x 1000\" with no unit is ten seats, ten days or ten sites - three different deals.",
    colCode: "Code",
    colName: "Name",
    colCategory: "Category",
    colUnit: "Unit",
    colStatus: "Status",
    statusActive: "On sale",
    statusRetired: "Retired",
    noCategory: "Uncategorised",
    addProduct: "Add or update a product",
    saveProduct: "Save product",
    productSaved: "Saved",
    codeHint: "Keyed by code: saving the same code again edits it rather than adding a second",
    solutions: "Solutions",
    solutionsWhy:
      "Quoting templates. Lines never reference one for calculation (ADR-014 s4) - a template is a starting point, not the authority.",
    solutionItems: (n: number) => `${n} products`,
    noSolutions: "No solutions yet",
    emptyBundle: "A solution with no products is just a name",
    pricebook: "Prices and floors",
    pricebookWhy:
      "The floor is why this table exists: a quote below it needs a signature. Prices are appended, never rewritten - the superseded row is what explains how today's number was arrived at.",
    colList: "List",
    colFloor: "Floor",
    colCurrency: "Currency",
    colEffective: "Effective",
    noPrices: "No prices yet",
    setPrice: "Record a price",
    priceSaved: "Recorded",
    floorEqualsList: "Floor equal to list = this product is not discountable. That is a position, not a typo",
    priceDenied:
      "You cannot set prices - whoever moves the floor can approve every discount in the product",
    writeDenied: "You cannot maintain the catalogue",
  },

  REVENUE_STATUS_LABEL: {
    planned: "Planned",
    invoiced: "Invoiced",
    settled: "Settled",
    overdue: "Overdue",
    written_off: "Written off",
  },

  ASK_ABOUT_TEXT: {
    anchored: (name: string) => `This conversation is anchored to ${name}`,
    // Says what the model can and cannot see. A grounded answer that looked
    // omniscient would get trusted past what it actually read.
    anchoredHint:
      "The copilot can read the follow-up notes and promises recorded against this account, and it cites which one it used. It will not fill in what it cannot see - anything nobody wrote down, it does not know either.",
    linkFromAccount: "Ask about this account",
  },

  CHAIN_TEXT: {
    title: "Decision chain",
    description:
      '"There is an economic buyer on file" and "someone can introduce us to them" are two different facts. Only the second one moves a deal.',
    covered: "Covered",
    missing: "Missing roles",
    blockers: "Blockers",
    coaches: "Coaches",
    reachable: "Economic buyer reachable",
    unreachable: "Economic buyer unreachable",
    unreachableHint:
      "No path from a coach to the economic buyer - the walk skips opposed relationships and contacts who have left.",
    noEconomicBuyer: "No economic buyer on file yet",
    influence: "Influence",
    emptyTitle: "No contacts yet",
    emptyDescription:
      "Add contacts and mark their decision roles, and the chain analysis appears here.",
    healthTitle: "Account health",
    healthDescription:
      "A derived value, recomputed from its sources. For sorting and alerting - never the sole basis for a business decision.",
    primaryConcern: "Biggest problem",
    recompute: "Recompute",
    factorPipeline: "Pipeline",
    factorRecency: "Contact recency",
    factorDelivery: "Delivery",
    factorCollections: "Collections",
  },

  DECISION_ROLE_LABEL: {
    economic: "Economic buyer",
    technical: "Technical buyer",
    user: "User",
    coach: "Coach",
    blocker: "Blocker",
    unknown: "Unknown",
  },

  RELATION_TYPE_LABEL: {
    reports_to: "Reports to",
    peer_of: "Peer of",
    allied_with: "Allied with",
    opposed_to: "Opposed to",
    referred_by: "Referred by",
  },

  COMMIT_STATUS_LABEL: {
    open: "Open",
    met: "Met",
    missed: "Missed",
    waived: "Waived",
  },

  WINLOSS_REASON_LABEL: {
    price: "Price",
    fit: "Solution fit",
    timing: "Timing",
    competitor: "Competitor",
    no_decision: "No decision",
    other: "Other",
  },

  RECENCY_TEXT: {
    title: "Who has actually been spoken to",
    description:
      'The panel above reads the org chart - the people on file and who reports to whom. This one reads the follow-up record: who actually appears in it. They are deliberately not merged. Follow-up coverage is not yet complete, so "no record" is not "no contact", and folding it into "missing roles" would let a gap in our own habits pose as a gap in the relationship.',
    warm: (days: number) =>
      `Contacted within ${days} day${days === 1 ? "" : "s"}`,
    cold: (days: number) =>
      `No contact for over ${days} day${days === 1 ? "" : "s"}`,
    unrecorded: "No follow-up on record at all",
    unrecordedHint:
      'Not the same as "not contacted in a long time" - it may simply never have been written down.',
    warmPathYes:
      "There is a workable path to the decision-maker, and it has actually been used",
    warmPathNo:
      "Someone on the path to the decision-maker has not been contacted in a long time",
    warmPathUnknown:
      "No follow-up on record for this account, so we cannot say",
    warmPathUnknownHint:
      'Answering "no" would use a gap in our own records to state a fact about the customer relationship.',
  },

  SIGNIN_TEXT: {
    description: "Sign in to verify your subscription and open the product.",
    cta: "Sign in",
    hint: "You will come back to this page after signing in",
    ariaLabel: "Sign in",
  },

  RELATION_TEXT: {
    title: "Add a relationship",
    description:
      'The relationship graph is append-only: when a relationship changes you add a new edge rather than rewriting the old one - "who reported to whom last quarter" is a fact the chain analysis has to read.',
    from: "From",
    to: "To",
    type: "Relationship",
    submit: "Record",
    saved: "Recorded",
    pick: "Pick a contact",
    readOnly: "You cannot edit the relationship graph.",
    needTwo: "At least two contacts are needed to record a relationship.",
    hintUnreachable:
      "Recording a path to the decision-maker can turn the verdict above from unreachable to reachable.",
  },

  RELATION_ERROR: {
    ...GATE_ERROR,
    self_relation: "A person cannot be related to themselves",
    unknown_relation_type: "Unknown relationship type",
    permission_denied: "You cannot edit the relationship graph",
    feature_not_in_tier: "Your tier does not include the relationship graph",
    no_data_access: "This workspace has no access",
  },

  FIELD_ERROR: {
    ...GATE_ERROR,
    note_required:
      "Write a line about what happened - recording only that it happened is worth nothing",
    occurred_in_future: "A follow-up cannot have happened in the future",
    unknown_evidence_kind: "Unknown evidence type",
    unknown_status: "Unknown status",
    waiver_required: "Waiving a commitment needs a written reason",
    unknown_direction: "Unknown commitment direction",
    unknown_channel: "Unknown follow-up channel",
    evidence_required:
      "Settling a promise has to point at a real follow-up, not just your word for it",
    reason_required: "Waiving a promise requires a reason",
    not_yet_due: "Not due yet, so it cannot be marked missed",
    illegal_transition: "That status change is not allowed from here",
    status_unchanged: "The status did not change",
    statement_required: "Write down what was promised",
    not_found: "No such record, or it belongs to another workspace",
    permission_denied: "You cannot record follow-ups",
    no_data_access: "This workspace has no access",
  },

  TERRITORY_ERROR: {
    ...GATE_ERROR,
    code_required: "A territory needs a code",
    name_required: "A territory needs a name",
    unknown_status: "Unknown territory status",
    parent_not_found: "The parent territory does not exist",
    parent_cycle: "A territory cannot report to itself, directly or through a chain",
    region_too_long: "A region name is at most 64 characters - anything longer is usually the wrong column pasted in",
  },

  EXECUTION_ERROR: {
    ...GATE_ERROR,
    title_required: "An execution needs a title",
    unknown_action_type: "Unknown action type",
    unknown_status: "Unknown execution status",
    campaign_completed: "This campaign is complete; its executions are the record it was completed on",
    not_found: "No such campaign, or that item is not on it",
  },

  healthOverrideText: (r: { code: string; count: number } | null): string => {
    if (!r) return "";
    switch (r.code) {
      case "overdue_instalment":
        return `${r.count} overdue instalment(s) - a project with unpaid instalments cannot be green`;
      case "missed_milestone":
        return `${r.count} missed milestone(s)`;
      default:
        return "";
    }
  },
  SIGNAL_ACTION_ERROR: {
    not_found: "Not found, or not in this workspace.",
    illegal_transition: "That status change is not allowed from here.",
    unknown_status: "Unknown status.",
    signal_closed: "This signal is closed.",
    score_required: "Score it first.",
    company_required: "Link a company first.",
    unknown_signal_type: "Unknown signal type.",
    account_required: "Match an account before converting.",
    conversion_incomplete: "The conversion is incomplete.",
    lead_converted: "This lead has already been converted.",
    lead_not_qualified: "This lead has not been qualified.",
    owner_required: "An assignment needs somebody to assign to.",
  },
  PROPOSAL_ERROR: {
    not_found: "Not found, or not in this workspace.",
    not_pending: "This proposal has already been decided.",
    decider_required: "Accepting must land on a named person.",
  },
  REVIEW_ERROR: {
    not_found: "Not found, or not in this workspace.",
    not_closed: "Only a closed opportunity can be reviewed.",
  },
  LOAD_ERROR: {
    not_authenticated: "Your session has expired. Please sign in again.",
    permission_denied: "You do not have permission to view this.",
    feature_not_in_tier: "Your plan does not include this capability.",
    unknown: "Could not load the data. Please try again.",
  },
  SEGMENT_ERROR: {
    segment_code_required: "A segment needs a code.",
    name_required: "A segment needs a name.",
    unknown_status: "That is not a segment status.",
    priority_out_of_range: "Priority is a whole number from 0 to 9999.",
    plan_closed:
      "This plan is closed. Its segmentation is the record of how the market was cut for that period.",
    not_found: "That plan does not exist.",
  },
  PLAN_ERROR: {
    ...GATE_ERROR,
    plan_no_required: "A plan needs a number",
    name_required: "A plan needs a name",
    period_required: "A plan needs a period",
    plan_no_taken: "That number is already taken",
  },

  MILESTONE_ERROR: {
    ...GATE_ERROR,
    name_required: "A milestone needs a name",
    sequence_invalid: "Sequence is a whole number from zero",
    unknown_status: "Unknown milestone status",
    done_needs_completion: "A milestone marked done must say when it was done",
    completion_needs_done: "A completion time belongs to a milestone that is done - a missed one did not happen",
    not_found: "No such project, or it belongs to another workspace",
  },

  CONTACT_ERROR: {
    ...GATE_ERROR,
    name_required: "A contact needs a name",
    unknown_decision_role: "Unknown decision role",
    unknown_status: "Unknown contact status",
    influence_range: "Influence is a whole number from 0 to 100",
    not_found: "That contact is not on this customer",
  },

  OPPORTUNITY_ERROR: {
    unknown_forecast_category: "Unknown forecast category",
    quantity_positive: "Quantity must be greater than zero",
    ...GATE_ERROR,
    stage_unchanged: "Already at this stage - an empty change is not recorded",
    terminal_stage:
      "This deal is closed; reopening needs explicit confirmation",
    reason_required: "This change requires a reason",
    unknown_stage: "Unknown stage",
    not_found: "No such deal, or it belongs to another workspace",
    probability_range: "Win rate must be a whole number between 0 and 100",
    terminal_probability_fixed:
      "A closed deal has a fixed win rate and cannot be changed",
    amount_negative: "The amount cannot be negative",
    empty_patch: "Nothing changed",
    closed_requires_terminal_stage:
      "A deal that is not closed cannot be marked won",
    terminal_requires_closed: "A closed deal can only be in a closed category",
    name_required: "A deal needs a name",
    account_required: "A deal must belong to a customer",
    not_below_floor: "This line is at or above its floor - there is nothing to approve",
    already_approved: "This price has already been signed off",
    not_priced: "This product has no price entry, so there is no floor to approve against",
  },

  OPPORTUNITY_TEXT: {
    linesTitle: "Product lines",
    linesWhy:
      "When lines exist, the lines are authoritative - the deal amount equals their sum, recomputed by the service in the same call that writes them. A single total cannot say what the money buys.",
    lineProduct: "Product",
    lineQty: "Qty",
    linePrice: "Unit price",
    lineAmount: "Amount",
    lineAdd: "Add a line",
    lineRemove: "Remove",
    lineSave: "Save lines and recompute the amount",
    lineSaved: (n: number, amount: string) => `${n} lines, amount recomputed to ${amount}`,
    lineNone: "No lines yet - the amount is a hand-entered total",
    lineNoneWhy: "That is the legal legacy shape: with no lines, the header stands on its own.",
    lineBelowFloor: "Below floor - needs a signature",
    lineFloorHint: (floor: string) => `Floor ${floor}`,
    lineDenied: "You cannot change this deal",
    lineClosedHint: "A closed deal cannot be repriced - its lines are the record of what was sold",
    lineApprovalHeader: "Discount",
    lineApprove: "Approve",
    lineApproved: "Approved",
    lineAwaiting: "Awaiting",
    lineApproveTitle: "Approve a price below floor",
    lineApproveWhy: (product: string) =>
      `${product} is quoted below its floor. The signature records this price; changing it voids the signature.`,
    lineApproveReason: "Why this floor is worth breaking",
    lineApproveCancel: "Cancel",
    notFound: "No such deal, or it belongs to another workspace",
    amount: "Amount",
    probability: "Win rate",
    expectedClose: "Expected close",
    owner: "Owner",
    account: "Account",
    campaign: "Source campaign",
    closedAt: "Closed at",
    noAttribution: "No attribution (not from a campaign)",
    attributionFrozen:
      "Attribution keys are immutable once created; corrections go through db-init",
    journeyTitle: "Stage journey",
    journeyDescription:
      "Every stage change writes an event, and velocity and conversion are computed from those - not inferred from the updated-at column, which only remembers the last write.",
    journeyEmptyTitle: "No stage changes recorded yet",
    journeyEmptyDescription:
      "This deal has not moved since it was created. Advance it once and the full journey appears here.",
    journeyFrom: "from",
    journeyCreated: "Created",
    journeyBy: "By",
    journeyByAgent: "Copilot",
    journeyReason: "Reason",
    journeyDuration: (days: number) =>
      `${days} day${days === 1 ? "" : "s"} in stage`,
    journeyCurrent: "Current stage",
    journeyTotal: (days: number) =>
      `${days} day${days === 1 ? "" : "s"} in total`,
    advanceTitle: "Advance the stage",
    advanceDescription:
      "The stage, the status and the close date change together, and an event is written.",
    advanceTo: "Advance to",
    advanceSubmit: "Confirm change",
    advanceReason: "Reason",
    advanceReasonRequired: "Moving a deal backwards requires a reason",
    advanceReasonRequiredReopen: "Reopening a closed deal requires a reason",
    advanceReasonPlaceholder: "Why this change",
    advanceReopen: "Reopen this deal",
    advanceReopenHint:
      "Reopening rewrites a result that has already been reported, so it needs explicit confirmation and a reason.",
    advanceClosedTitle: "This deal is closed",
    advanceClosedDescription:
      "A closed deal's stage cannot be changed directly. To correct it, tick reopen and give a reason.",
    advanceReadOnly: "You cannot advance deals.",
    advanceReviewRequired: "This deal has closed - a review is still owed.",
    advanceRegressionHint: (from: string) => `This moves back from ${from}`,
    advanceTerminalHint:
      "Closing also writes the close date and requires a review",
    advanceOverrideKept:
      "A manual win rate is set; this change will not overwrite it",
    advanceOverrideReset:
      "Closing fixes the win rate at 100% / 0% and drops the manual value",
    termsTitle: "Commercial terms",
    termsDescription:
      "Amount, win rate, expected close and forecast category. Once the win rate is set by hand, later stage changes leave it alone - except on close.",
    termsAmount: "Amount",
    termsProbability: "Win rate (0-100)",
    termsExpectedClose: "Expected close",
    termsForecast: "Forecast category",
    termsSubmit: "Save",
    termsSaved: "Saved",
    termsUnchanged: "Nothing changed",
    termsTerminalLocked:
      "The deal is closed, so the win rate is fixed and cannot be changed",
    termsReadOnly: "You cannot change the commercial terms.",
  },

  WINLOSS_TEXT: {
    sectionTitle: "Win/loss reviews",
    filterPending: "Awaiting review",
    filterAll: "All reviews",
    allEmptyTitle: "No closed deals yet",
    allEmptyDescription:
      "Once a deal is won or lost it appears here awaiting its review.",
    columnState: "State",
    reviewed: "Reviewed",
    recordHintDone: "This one has already been reviewed",
    recordHintDenied: "You cannot record reviews",
    title: "Awaiting review",
    description:
      "Closed deals with no review yet. The win/loss reason is structured data that feeds back into scoring and suggestions - unwritten, there is no loop.",
    columnOpportunity: "Deal",
    columnOutcome: "Outcome",
    columnAmount: "Amount",
    columnClosed: "Closed",
    outcomeWon: "Won",
    outcomeLost: "Lost",
    record: "Write the review",
    reasonLabel: "Main reason",
    competitorLabel: "Competitor",
    lessonsLabel: "Lessons",
    save: "Save",
    cancel: "Cancel",
    saved: "Recorded",
    emptyTitle: "No deals awaiting review",
    emptyDescription:
      "Deals appear here when they close, and stay until the review is written.",
  },

  POSITION_TEXT: {
    designate: "Set tier",
    designateWhy:
      "A strategic account is judged differently: every other rule is event-triggered and needs an open opportunity, while the thing most worth reporting about a strategic account is that it went quiet WITHOUT one - and no event will ever fire to say so. The cadence rule is what fires instead, and it reads the plan.",
    planRequired: "A strategic account needs a plan, or the tier is just a label",
    planPeriod: "Plan period",
    cadenceContact: "Contact cadence (days)",
    cadenceExec: "Executive cadence (days)",
    designateSubmit: "Set the tier",
    designated: (tier: string) => `Set to ${tier}`,
    designateDenied: "You cannot change this account",
    tierStrategic: "Strategic account",
    tierKey: "Key account",
    tierStandard: "Standard account",
    planOf: (period: string) => `${period} account plan`,
    planTarget: "Plan target",
    planDeals: "Open deals",
    triangle: "The team on it",
    triangleOf: (sales: string, presales: string, delivery: string) =>
      `Sales ${sales} - Presales ${presales} - Delivery ${delivery}`,
    roleOwner: "Sales",
    rolePresales: "Presales",
    roleDelivery: "Delivery",
    roleUnset: "Unassigned",
    external: "Their side",
    externalWhy:
      "How they decide, what we are delivering to them, and who else is in the room.",
    chain: "Decision chain",
    chainCovered: "Roles covered",
    chainMissing: "Roles missing",
    chainCoaches: "Coaches",
    chainBlockers: "Resistance",
    chainUnreachable: "Decision-maker unreachable",
    chainReachable: "Decision-maker reachable",
    projects: "Projects in delivery",
    noProjects: "Nothing is in delivery for this account",
    // Words that betray a rival in a free-text note. NOT translations of the
    // Chinese list: an English-speaking rep writes "the other vendor", not a
    // rendering of "友商". A word list only works in the language it was
    // written in.
    rivalWords: [
      "competitor",
      "rival",
      "the other vendor",
      "incumbent",
      "another vendor",
      // Widen<> strips the readonly, so the zh side's `as readonly string[]`
      // does not carry over - the dictionary type wants a mutable array here.
    ],
    competition: "Competition",
    competitionNone:
      "No structured competitive intelligence yet. Below are the passages in the follow-up notes that mention a rival - currently the only evidence there is.",
    competitionNoMention:
      "No competitor appears in the follow-up notes. That does not mean there is none, only that nobody wrote one down.",
    scout: "Run a competitive analysis",
    internal: "Our side",
    internalWhy: "Who is on it, what has been done, and where it is stuck.",
    problems: "Problems worth naming",
    problemsWhy:
      "Derived by rules from recorded evidence - not a risk list somebody filled in.",
    noProblems: "The rules found no problems on this account.",
    history: "Follow-up history",
    historyCount: (n: number) => `${n} record${n === 1 ? "" : "s"}`,
    plan: "What we intend to do next",
    planWhy:
      "The copilot proposes, a person signs. Nothing runs until somebody accepts it.",
    planEmpty: "The copilot has nothing proposed for this account.",
    planCommercial: "Commercial",
    planTechnical: "Product and technical",
    planRelation: "Relationship",
    actionLabels: {
      advance_stage: "Advance to the next stage",
      draft_outreach: "Draft an outreach",
      promote_signal: "Promote the signal to a lead",
      adjust_forecast: "Adjust the forecast",
      draft_email: "Draft an email",
    } as Record<string, string>,
    approve: "Approve",
    reject: "Reject",
    confidence: (n: number) => `Confidence ${n}`,
  },

  // A FUNCTION, so the whole switch is re-implemented rather than a table
  // being swapped. It reads STAGE_LABEL, and it has to read the ENGLISH one -
  // closing over the Chinese import here would have produced a sentence in
  // both languages at once.
  healthReasonText: (r: {
    code: string;
    count?: number;
    days?: number;
    furthestStage?: string;
  }): string => {
    const stage =
      (en.STAGE_LABEL as Record<string, string>)[r.furthestStage ?? ""] ??
      r.furthestStage;
    // ENGLISH HAS PLURALS AND CHINESE DOES NOT, which is why this helper has
    // no counterpart on the zh side and is not an oversight there. Without it
    // the panel read "1 instalments overdue" - a defect that literally could
    // not appear until the first sentence was rendered in English.
    const n = (count: number | undefined, one: string, many: string) =>
      `${count} ${count === 1 ? one : many}`;
    switch (r.code) {
      case "no_open_deals":
        return "No open deals";
      case "open_deals":
        return `${n(r.count, "open deal", "open deals")}, furthest at ${stage}`;
      case "never_contacted":
        return "No follow-up on record at all";
      case "quiet_days":
        return `No contact for ${n(r.days, "day", "days")}`;
      case "contacted_days":
        return `Last contact ${n(r.days, "day", "days")} ago`;
      case "projects_red":
        return `${n(r.count, "project", "projects")} red`;
      case "projects_amber":
        return `${n(r.count, "project", "projects")} amber`;
      case "projects_green":
        return `${n(r.count, "project", "projects")} green`;
      case "overdue_revenue":
        return `${n(r.count, "instalment", "instalments")} overdue`;
      case "revenue_clean":
        return "No overdue collections";
      default:
        return r.code;
    }
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
    notificationsWithCount: (n: number) => `Notifications, ${n} waiting`,
    notificationsEmpty: "Nothing waiting on you",
    notificationLabel: {
      overdue: "Overdue commitments",
      reviews: "Closed deals awaiting review",
      downgraded: "Projects with downgraded health",
    } as Record<string, string>,
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
    buyerUnreachable: "buyer unreached",
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
    snapshot: "Take a snapshot",
    snapshotPending: "Recording...",
    snapshotTaken: "Added to the series",
    snapshotFailed: "The snapshot was not stored",
    snapshotDenied:
      "You cannot submit a forecast - the person who reads one is often not the person who commits to it",
    newTitle: "New deal",
    newWhy:
      "Not every deal comes from a lead. Self-sourced, referred, or a customer who walked in - they start here.",
    newName: "Deal name",
    newAccount: "Customer",
    newPickAccount: "Pick a customer",
    newTerritory: "Territory",
    newNoTerritory: "Unassigned",
    newAmount: "Amount (optional for now)",
    newExpectedClose: "Expected close",
    newSave: "Create deal",
    newMade: (no: string) => `Created ${no}`,
    newSelfSourced:
      "A deal entered here is attributed as self-sourced, and that cannot be changed afterwards - the attribution keys carry no UPDATE grant. A campaign-sourced deal should arrive by converting its lead.",
    productSplit: "What the commit is made of",
    productSplitWhy:
      "Split by product line. A single total cannot say what the money is for.",
    needsApproval: "Discount pending approval",
    undatedExcluded: (n: number) =>
      `${n} open deals carry no expected close date and are in none of these totals - a deal with no date belongs to no period`,
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

  // --- /account -----------------------------------------------------------

  ACCOUNT_TEXT: {
    buyerUnreachable: "buyer unreached",
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
    columnSegment: "Segment",
    columnOwner: "Owner",
    columnHealth: "Health",
    columnStatus: "Status",
    unscored: "Not assessed",
    emptyTitle: "No accounts yet",
    emptyDescription:
      "They appear here once a lead converts or one is entered by hand.",
    rowCount: (n: number) => `${n} accounts`,
    roster: "Positions",
    rosterWhy:
      "The pursuits running on this account. A theatre that cannot count its own positions is not commanding anything.",
    rosterDeals: "Open deals",
    rosterProjects: "Delivery projects",
    rosterNoDeals: "No open deals",
    rosterNoProjects: "No delivery projects",
    rosterOpenDeal: "Open the deal",
    rosterOpenProjects: "Go to delivery",
    dossier: "Dossier",
    dossierOwner: "Owner",
    dossierIndustry: "Industry",
    dossierRegion: "Region",
    dossierContacts: "Contacts",
    dossierCoaches: "coaches",
    dossierBlockers: "blockers",
    dossierUnreachable: "decision-maker untouched",
    plan: "Theatre plan",
    planWhy:
      "The next move on the RELATIONSHIP, not on any one deal - that belongs to the position. The agent proposes, you decide.",
    planEmpty: "Nothing awaiting a decision",
    planEmptyWhy:
      "No proposals is not the same as no problems - it means nobody has asked. Ask the copilot and it will propose.",
    backToList: "Accounts",
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
    contactsTitle: "Contacts",
    contactsWhy:
      "The people inside this customer and what each is to the deal. The chain above and the board's decision-maker coverage are both computed from these roles.",
    contactsNone: "No contacts yet",
    contactsNoneWhy: "Write down who you have met - the decision chain has nothing to compute until then.",
    contactName: "Name",
    contactTitle: "Title",
    contactDepartment: "Department",
    contactRole: "Decision role",
    contactInfluence: "Influence 0-100",
    contactStatus: "Status",
    contactStatusLabel: { active: "Active", left: "Left", invalid: "Invalid" } as Record<string, string>,
    contactEditing: "Editing",
    contactNew: "New contact",
    contactSave: "Save contact",
    contactSaved: "Saved",
    contactsDenied: "You cannot maintain contacts",
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
    executionsTitle: "Campaign executions",
    executionsWhy:
      "What a campaign is actually made of. The \"N/M done\" column above counts these - and a campaign cannot be marked complete while any is outstanding.",
    executionsNone: "No executions yet",
    executionsNoneWhy: "List the actions first - a campaign cannot be run or closed without them.",
    executionCampaign: "Campaign",
    executionPickCampaign: "Pick a campaign",
    executionTitle: "Action",
    executionType: "Type",
    executionTypeLabel: {
      outreach: "Outreach",
      content: "Content",
      event: "Event",
      nurture: "Nurture",
      handoff: "Handoff",
    } as Record<string, string>,
    executionAssignee: "Assignee",
    executionDue: "Due",
    executionStatus: "Status",
    executionStatusLabel: {
      pending: "Pending",
      in_progress: "In progress",
      done: "Done",
      skipped: "Skipped",
    } as Record<string, string>,
    executionEditing: "Editing",
    executionNew: "New execution",
    executionSave: "Save execution",
    executionSaved: "Saved",
    executionsDenied: "You cannot maintain campaign executions",
    executionBlocks:
      "Pending and in-progress both count as outstanding - one of either keeps the campaign from being completed. Finish it or skip it; both settle. A completed campaign's executions are frozen: they are the record it was completed on.",
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
    collections: "Collections",
    collectionsWhy:
      "The chain does not end at the win, it ends when the money arrives. Instalments follow the transition map; settled and written-off are terminal - money that arrived did arrive, and a write-off is corrected by a new schedule, not by editing this row.",
    colProject: "Project",
    colSeq: "No.",
    colPlanned: "Planned",
    colActual: "Received",
    colDue: "Due",
    colRevStatus: "Status",
    noInstalments: "No collection schedule yet",
    overdueCount: (n: number) => `${n} overdue`,
    settleAsk: "How much actually arrived? Short payment is normal - the received amount is the point",
    moveTo: "Move to",
    moved: (s: string) => `Moved to ${s}`,
    milestonesTitle: "Delivery plan",
    milestonesWhy:
      "The milestones a project is delivered against. They were always read and never rendered, and never writable - so a delivery plan could only be whatever db-init put there.",
    milestonesNone: "No milestones yet",
    milestonesNoneWhy: "Lay out the steps - the health verdict in the table above reads them.",
    milestoneProject: "Project",
    milestonePickProject: "Pick a project",
    milestoneSequence: "Sequence",
    milestoneName: "Milestone",
    milestoneDue: "Due",
    milestoneCompleted: "Completed",
    milestoneStatus: "Status",
    milestoneStatusLabel: {
      pending: "Pending",
      in_progress: "In progress",
      done: "Done",
      missed: "Missed",
    } as Record<string, string>,
    milestoneSave: "Save milestone",
    milestoneSaved: "Saved",
    milestonesDenied: "You cannot maintain the delivery plan",
    milestoneAffectsHealth:
      "Sequence is unique within a project and cannot be changed - it IS the milestone's identity, so saving the same sequence again edits that one. A missed milestone overrides the manager's reported green in the table above.",
    moveDenied: "You cannot change collections",
    reconcile: "Recompute health",
    reconcileHint:
      "Re-derive it from this project's own milestones and instalments, overriding what was reported by hand",
    reconcileAgreed: "The report already matched the rows - nothing changed",
    reconcileChanged: (health: string) => `Changed to ${health}`,
    reconcileWhy: (because: string) => `Because: ${because}`,
    reconcileDenied: "You cannot change delivery projects",
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
    window_inverted: "The end date cannot be before the start date",
    start_required: "An end date needs a start date",
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
    timelineShown: (shown: number, total: number) =>
      `latest ${shown} of ${total}`,
    timelineExpand: "Show all",
    timelineCollapse: "Show recent only",
    commitOverdueTitle: "Overdue promises",
    commitOwner: (who: string) => `owner ${who}`,
    commitOwnerNone: "No owner assigned",
  },

  DIRECTION_LABEL: {
    we_owe: "We promised",
    they_owe: "They promised",
  },

  // --- /planning ----------------------------------------------------------

  PLANNING_TEXT: {
    setTarget: "Set a target",
    setTargetWhy:
      "A target's scope tuple is its identity: one target per period, scope and metric. To change the number, adjust the one that exists rather than adding a second.",
    setScope: "Scope",
    scopeTerritory: "Territory",
    scopeOwner: "Me",
    setMetric: "Metric",
    territoryTitle: "Sales territories",
    territoryWhy:
      "Who carries which patch of the market. A territory is one of the scopes a target can be set on - with no territory there is no regional target. The code is the identity: an existing code edits that territory, a new one creates it.",
    territoryNone: "No territories yet",
    territoryNoneWhy: "Create one before setting a target on it or attributing deals to it.",
    territoryCode: "Code",
    territoryName: "Name",
    territoryParent: "Parent",
    territoryNoParent: "Top level",
    territoryOwner: "Owner",
    territoryNoOwner: "Unassigned",
    territoryStatus: "Status",
    territoryActive: "Active",
    territoryRetired: "Retired",
    territorySave: "Save territory",
    territorySaved: "Saved",
    territoryDenied: "You cannot maintain territories",
    setAmount: "Target amount",
    setCount: "Target customer count",
    countUnit: (n: string) => `${n} customers`,
    gapLabel: {
      no_snapshot: "No snapshot",
      no_cost_data: "Needs cost data",
      not_counted: "Not counted",
    } as Record<string, string>,
    gapHint: {
      no_snapshot: "No forecast snapshot has been submitted for this scope this period - that is not 0% attained",
      no_cost_data: "Margin needs cost, and cost is not in the model yet. Not a missed period, and not a metric that cannot be computed - supply cost and it can be",
      not_counted: "This snapshot carries no new-logo count - it predates the field, or its period label could not be parsed into dates",
    } as Record<string, string>,
    setSubmit: "Create target",
    setSaved: "Created",
    setDenied: "You cannot set targets",
    adjust: "Adjust the amount",
    adjustSaved: "Adjusted",
    commit: "Commit it",
    commitWhy: "Committing cannot be undone - a number already reported upward does not come back",
    closeTarget: "Close the period",
    closeWhy:
      "Closing freezes it. It records what was committed for a finished period, and editing that is how a missed quarter becomes a met one",
    rowDenied: "You cannot adjust targets",
    metricRevenue: "Revenue",
    metricNewLogo: "New logos",
    metricPipeline: "Pipeline",
    metricMargin: "Margin",
    statusDraft: "Draft",
    statusCommitted: "Committed",
    statusClosed: "Closed",
    title: "Sales planning",
    description:
      "Targets are set by this domain; attainment is computed from the pipeline domain's forecast snapshots. Neither writes the other's data.",
    lead: (period: string) => `${period} sales planning`,
    leadAttained: (closed: string, target: string, pct: string) =>
      `Workspace ${closed} / ${target} - ${pct} attained`,
    leadNoWorkspaceTarget: "No workspace-wide target was set this period.",
    leadUnforecast: (n: number) =>
      `${n} scopes have submitted no forecast snapshot this period - that is not 0% attained.`,
    leadRule:
      "Targets are set here; attainment is computed from the pipeline's forecast snapshots. The two domains never write each other's data.",
    rowCount: (n: number) => `${n} scopes`,
    ownerScope: (sub: string) => sub,
    scopeUnnamed: "Unnamed",
    columnScope: "Scope",
    columnMetric: "Metric",
    columnTarget: "Target",
    columnClosed: "Closed",
    columnAttainment: "Attainment",
    columnStatus: "Status",
    noSnapshot: "No snapshot",
    noSnapshotHint:
      "This scope has submitted no forecast snapshot this period, which is not the same as 0% attained.",
    emptyTitle: "No targets this period",
    emptyDescription:
      "They appear here once sales ops sets territories and quotas.",
    scopeWorkspace: "Whole workspace",
  },

  TARGET_STATUS_LABEL: {
    draft: "Draft",
    committed: "Committed",
    closed: "Closed",
  },

  TARGET_METRIC_LABEL: {
    revenue: "Revenue",
    new_logo: "New logos",
    pipeline: "Pipeline",
    margin: "Margin",
  },

  // --- /strategy ----------------------------------------------------------

  STRATEGY_TEXT: {
    segmentsTitle: "Market segments",
    segmentsWhy:
      "The market you are going after, cut into named pieces and ordered by priority. Accounts carry a segment code that points here, and a campaign can aim at one - until now every one of those references pointed at nothing.",
    segmentsNone: "No segments yet",
    segmentsNoneWhy:
      "Account records already use segment codes, but nothing defines them yet. Create one below and matching codes connect.",
    segmentsDenied: "You do not have permission to edit segments.",
    segmentEditing: "Editing which",
    segmentNew: "New segment",
    segmentNoPlan: "Not under a plan",
    segmentCodeHeader: "Code",
    segmentNameHeader: "Name",
    segmentPlanHeader: "Plan",
    segmentPriorityHeader: "Priority",
    segmentAccountsHeader: "Accounts",
    segmentMatchedHeader: "Matched",
    segmentCriteriaHeader: "Criteria",
    segmentIndustries: "Industry filter",
    segmentRegions: "Region filter",
    segmentListHint: "Comma-separated; may be empty",
    segmentStatusHeader: "Status",
    segmentSave: "Save segment",
    segmentSaved: "Saved",
    segmentStatusLabel: {
      active: "Active",
      paused: "Paused",
      retired: "Retired",
    },
    newPlanTitle: "New plan",
    newPlanWhy:
      "A plan is where the chain starts - targets and campaigns hang off one. Until now a plan could be moved through its lifecycle and not created.",
    newPlanNo: "Plan number",
    newPlanName: "Name",
    newPlanPeriod: "Period",
    newPlanOwner: "Owner",
    newPlanObjective: "Objective",
    newPlanSave: "Create plan",
    newPlanSaved: "Created",
    newPlanAnchor:
      "The number is unique per workspace and cannot be changed after creation - it IS the plan's identity. A new plan is always a draft; approval and every later move belong to the table below, which is what stamps the approval time.",
    title: "Market strategy",
    description:
      "Strategy is where the chain starts: campaigns, leads and opportunities downstream can all point back to it.",
    lead: (n: number) => `${n} market strategies`,
    leadTraced: (campaigns: number, orphan: number) =>
      orphan > 0
        ? `${campaigns} campaigns trace back to a strategy; ${orphan} have no owner.`
        : `All ${campaigns} campaigns trace back to a strategy.`,
    leadNoCampaignRead:
      "No permission to read campaigns, so downstream cannot be counted.",
    leadRule:
      'Strategy is where the chain starts. Campaigns, leads and opportunities all point back to it - which is what makes "how much of this quarter came from the segment we chose to attack" a join rather than a manual tally.',
    rowCount: (n: number) => `${n} strategies`,
    columnCampaigns: "Downstream",
    campaignCount: (n: number) => `${n}`,
    noCampaigns: "None",
    ownerNone: "Unassigned",
    columnName: "Strategy",
    columnPeriod: "Period",
    columnOwner: "Owner",
    columnStatus: "Status",
    emptyTitle: "No strategies yet",
    emptyDescription:
      "Define which market to attack this period and what to achieve.",
  },

  PLAN_STATUS_LABEL: {
    draft: "Draft",
    approved: "Approved",
    active: "Active",
    closed: "Closed",
    archived: "Archived",
  },

  // --- /copilot -----------------------------------------------------------

  PROPOSAL_TEXT: {
    title: "Copilot proposals",
    description:
      "The agent proposes, a human decides. Nothing runs until it is accepted, and a proposal's content cannot be edited.",
    lead: (n: number) => `${n} proposals awaiting your call`,
    leadNone: "Nothing awaiting a decision",
    leadLowConfidence: (n: number) =>
      `${n} of them are below 60% confidence - read the reasoning on those first.`,
    leadRule:
      "The agent only proposes; a human accepts. A proposal's content cannot be edited - to change it, reject it and let the agent propose again.",
    rowCount: (n: number) => `${n} proposals`,
    columnSubject: "Subject",
    columnAction: "Proposed action",
    columnRationale: "Reasoning",
    columnConfidence: "Confidence",
    columnStatus: "Status",
    columnDecider: "Decided by",
    confidenceMissing: "Not given",
    autopilotMarker: "Ran unattended",
    selectAll: "Select all proposals awaiting a decision",
    selectOne: (actionType: string) => `Select the ${actionType} proposal`,
    selectedLabel: (count: number, lowConfidence: number) =>
      lowConfidence > 0
        ? `${count} selected - ${lowConfidence} of low confidence`
        : `${count} selected`,
    clearSelection: "Clear",
    selectionNoun: "proposals",
    bulkReject: "Reject selected",
    bulkAccept: "Accept selected",
    emptyTitle: "No proposals",
    emptyDescription:
      "The copilot has proposed nothing yet. Ask it something, or wait for signal scoring to produce one.",
    confirmTitle: (verb: string, count: number) =>
      `${verb} ${count} proposals?`,
    confirmDetail: (opts: {
      actionTypes: string;
      subjectTypes: string;
      meanConfidence: number | null;
      lowConfidenceCount: number;
    }) =>
      `Action types: ${opts.actionTypes}; subjects: ${opts.subjectTypes}. ` +
      (opts.meanConfidence == null
        ? "These proposals carry no confidence figure."
        : `Mean confidence ${Math.round(opts.meanConfidence)}%.`) +
      (opts.lowConfidenceCount > 0
        ? ` ${opts.lowConfidenceCount} are below 60%.`
        : ""),
    verbAccept: "Accept",
    verbReject: "Reject",
    cancel: "Cancel",
    confirm: (verb: string) => verb,
    acceptNote:
      "Each one records you as the decider. Doing them in bulk does not reduce the trail.",
    rejectNote:
      "A rejection is signed too, and a rejected proposal keeps its full record.",
  },

  AGENT_SUBJECT_LABEL: {
    account: "Account",
    lead: "Lead",
    opportunity: "Opportunity",
    project: "Project",
    campaign: "Campaign",
    plan: "Strategy",
  },

  AGENT_ACTION_LABEL: {
    advance_stage: "Advance the stage",
    draft_email: "Draft an email",
    draft_outreach: "Draft outreach",
    promote_signal: "Promote the signal to a lead",
  },

  ACTION_STATUS_LABEL: {
    proposed: "Awaiting decision",
    accepted: "Accepted",
    rejected: "Rejected",
    executed: "Executed",
    failed: "Failed",
    expired: "Expired",
  },

  COPILOT_TEXT: {
    title: "Sales copilot",
    description:
      "Ask it what to do next. What it gives back are proposed actions; nothing runs until you accept one.",
    placeholder:
      "For example: which deals most need attention this quarter? Who should we approach next at East China Retail?",
    submit: "Send",
    thinking: "Thinking",
    emptyTitle: "No conversation yet",
    emptyDescription:
      "Ask the copilot something. It answers from your accounts, deals and delivery data, and proposes an action when one is needed.",
    proposalsFromTurn: (n: number) =>
      `${n} proposed actions from this turn, awaiting your decision`,
    droppedProposals: (n: number) =>
      `${n} further suggestions were not recorded: this tier does not include unprompted proposals`,
    capabilitiesUsed: (names: string) => `External capabilities used: ${names}`,
    truncated:
      "This turn hit the tool-call limit; the answer is based on what was retrieved",
    errorPrefix: "The copilot could not answer: ",
    errorNotConfigured:
      "The model plane is not connected yet (operations has to register and authorise it)",
    errorNoGrant: "This product has no grant on the model plane",
    errorQuota: "The model usage quota is exhausted",
    errorGeneric: "Try again shortly; if it keeps failing, contact operations",
    newSession: "New conversation",
  },

  PLAYBOOK_TEXT: {
    title: "Playbooks",
    description:
      "The copilot cites these when it answers. They are here to be seen, questioned and revised - when you disagree with an answer, you can find the sentence that produced it.",
    emptyTitle: "No playbooks yet",
    emptyDescription:
      "A playbook is how this workspace does things. Without one, the copilot answers from data alone.",
    version: "Version",
    grounding: (n: number) =>
      `At most ${n} relevant playbooks are cited per turn`,
  },

  PLAYBOOK_SCOPE_LABEL: {
    strategy: "Strategy",
    planning: "Planning",
    campaign: "Campaign",
    account: "Account",
    signal: "Signal",
    pipeline: "Pipeline",
    delivery: "Delivery",
    copilot: "General",
  },

  // --- /admin -------------------------------------------------------------

  MEMBER_TEXT: {
    title: "Members and roles",
    description:
      "Roles decide what a member can see and change. A new member appears here after their first sign-in, holding no role - assign one here.",
    columnMember: "Member",
    columnRoles: "Roles",
    columnActions: "",
    noRoles: "No role",
    noRolesHint: "This member can see nothing at all",
    assign: "Assign",
    revoke: "Remove",
    assignPlaceholder: "Pick a role",
    emptyTitle: "No members yet",
    emptyDescription: "Members appear here after their first sign-in.",
    readOnly: "You hold no permission to manage member roles.",
    adminBadge: "Can manage members",
    lastAdminHint:
      "This is the workspace's last administrator; removing it leaves nobody able to assign roles",
  },

  MEMBER_ERROR: {
    last_admin:
      "This is the workspace's last administrator; removing it leaves nobody able to assign roles",
    unknown_role: "That role is not in the catalog",
    sub_required: "Pick a member",
    not_found: "That member does not belong to this workspace",
    not_authenticated: "Your session has expired; sign in again",
    permission_denied: "You hold no permission to manage member roles",
    no_data_access: "This workspace has no access",
  },

  ROLE_LABEL: {
    sales_leader: "Sales leader",
    marketing_manager: "Marketing manager",
    sales_rep: "Sales rep",
    presales: "Presales",
    delivery_manager: "Delivery manager",
    sales_ops: "Sales ops",
    viewer: "Viewer",
  },

  ADOPTION_TEXT: {
    navLabel: "Adoption",
    title: "How the notes are being used",
    description:
      'This table does not answer "who is doing well" but "is any of this being used". Whether stage two - the agent reasoning over history - is worth building depends on these numbers (criteria in ADR-012). Over an empty evidence table, a reasoning layer only produces confident fiction.',
    notAScoreboard:
      "Deliberately not broken down by person. The moment this table can be read as a performance score, people record FOR it, and it stops measuring what it was meant to.",
    coverage: "Coverage",
    coverageHint:
      "Share of that week's open deals that got at least one note recorded",
    rate: "Density",
    rateHint: "Notes that week over open deals that week; for reference only",
    week: "Week",
    weekInProgress: "This week (in progress, excluded from the verdict)",
    openDeals: "Open deals",
    touched: "Touched",
    notes: "Notes",
    noDeals: "No open deals",
    criterion: (pct: number, weeks: number) =>
      `Criterion: mean coverage over the last ${weeks} weeks reaches ${pct}%. Judged on the last two weeks rather than a six-week mean - the question is whether the habit exists NOW, not whether week one was enthusiastic.`,
    verdictAdopted: "The recording habit has formed",
    verdictAdoptedHint:
      "The precondition for stage two - claims and judgements - holds.",
    verdictNotAdopted: "The recording habit has not formed",
    verdictNotAdoptedHint:
      "By ADR-012's criteria, stage two should not be built yet. What needs fixing is the capture path itself, not more reasoning over empty data.",
    verdictTooEarly: "The observation window is not complete",
    verdictTooEarlyHint:
      "Not yet a basis for a verdict. A criterion that can fail early will be cited early.",
    verdictNoData: "No open deals yet",
    verdictNoDataHint:
      "There is nothing to record against. That is not a failure.",
    darkDeals: "Open deals with no recent note",
    darkDealsHint:
      "These deals have not a single note inside the observation window. The ones parked in a late stage are worth looking at first.",
    darkDealsEmpty: "Every open deal has a note inside the window.",
  },

  // --- the home screen and the two flanks ---------------------------------

  HOME_TEXT: {
    title: "Today's calls",
    description: (n: number) =>
      `Derived from recorded notes across ${n} accounts. One opens at a time.`,
    emptyTitle: "Nothing needs you right now",
    emptyDescription:
      'No overdue promises, no long silences, no decision-maker left untouched. This is not "no data" - it was scanned, and there genuinely is nothing.',
    emptyNoRecords:
      "No notes have been recorded yet, so nothing can be derived. Judgements grow out of records; the first step is to write one down.",
    scopeMine: "Mine",
    scopeAll: "All",
    urgencyAll: "All",
    urgencyToday: "Today",
    urgencyWeek: "This week",
    urgencyWatch: "Watch",
    sourceRule: "Rule",
    sourceModel: "Model",
    sourceRuleHint: "Computed - you can check the arithmetic yourself",
    sourceModelHint: "Observed - you can only check the passages it cites",
    secEvidence: "Evidence",
    secEvidenceCount: (n: number) => `Evidence - ${n}`,
    secFacts: "Key facts",
    secSeries: "By week",
    secRule: "Trigger",
    lead: (n: number) => `${n} calls for you today`,
    leadNone: "Nothing for you to decide today",
    queueLabel: "Pending judgements",
    leadSub: (accounts: number, judgements: number) =>
      `Scanned notes across ${accounts} accounts and derived ${judgements} judgements`,
    evidenceMore: (n: number) => `${n} more`,
    evidenceLess: "Show only the latest",
    factInline: (label: string, value: string) => `${label} ${value}`,
    factJoin: " - ",
    expand: "Expand",
    collapse: "Collapse",
    analysisRisk: "Risk",
    analysisCompetition: "Competition",
    analysisChain: "Decision chain",
    analysisPolicy: "Policy and industry",
    analysisHint: 'The result enters the feed as a "model" judgement',
    citedBy: (days: number, channel: string) => `${days}d ago - ${channel}`,
    actDismissHint: "Held for 7 days; it returns sooner if urgency rises",
    actDismiss: "Not now",
    agentTitle: "Copilot",
    agentScope: (n: number) => `Watching ${n} accounts`,
    agentNote: "Write one down",
    agentAsk: "Ask",
    agentPlaceholder: "Just got off the phone with Wang...",
    agentHelp:
      "Three sentences, a chat message, a forwarded email - all count. The original is kept verbatim.",
    agentSend: "Save",
    agentPending: "Awaiting me",
    agentPendingCount: (n: number) => `Awaiting me - ${n}`,
    agentPendingWhen: (source: string, when: string) => `${source} - ${when}`,
    truncate: (text: string) => `${text}...`,
    agentRecent: "Recently recorded",
    // The mark inside the copilot's avatar. A single Chinese glyph is the
    // product's own monogram, not a word - it stays as it is, the way a
    // wordmark does.
    agentAvatar: "\u807f",
    agentComposeLabel: "Write a note or ask the copilot",
    scopeLabel: "Scope",
    urgencyLabel: "Urgency",
    openSubject: "Open the deal",
    openTeam: "See the adoption board",
    whenToday: "today",
    whenDaysAgo: (n: number) => `${n}d ago`,
    pendingFromScan: "this morning's scan",
    pendingFromClick: "you asked for analysis",
    pendingTitle: (subject: string, claim: string) => `${subject} - ${claim}`,
  },

  CHANNEL_LABEL: {
    meeting: "Meeting",
    call: "Call",
    visit: "Visit",
    email: "Email",
    im: "Message",
    event: "Event",
    other: "Other",
  },

  // The left board and the right deck - the two flanks, on every page.
  // Replaces the partial override that pulled `wan` forward for /pipeline.
  BOARD_TEXT: {
    segments: "segments",
    solutions: "solutions",
    pricedProducts: "priced",
    namedAccounts: "key",
    forecastDisagreements: "disputed",
    unrouted: "to assign",
    quoteApprovals: "to sign",
    unreviewed: "to review",
    renewalsDue: "due",
    contractValue: "in delivery",
    openDeals: "open",
    catalog: "Catalogue",
    pipelineArchive: "Deals",
    deals: "deals",
    catalogProducts: "products",
    openThread: "Full conversation",
    queue: "Your calls",
    ledeToday: "For you today",
    proposals: "proposals to sign",
    today: "Today's calls",
    adjudicate: "Awaiting me",
    mydeals: "My deals",
    strategy: "Market strategy",
    campaign: "Campaigns",
    planning: "Sales planning",
    account: "Accounts",
    signal: "Signal inbox",
    delivery: "Delivery",
    tierToday: "Today",
    tierWeek: "This week",
    tierWatch: "Watch",
    pending: "awaiting a call",
    actAdvance: "Advance the stage",
    actOutreach: "Draft outreach",
    actPromote: "Promote the lead",
    actOther: "Other",
    capUnlabelled: "Unlabelled",
    capabilityLabels: {
      "deal.stall_risk": "Stall risk",
      "deal.competition": "Competition",
      "account.chain_map": "Chain mapping",
      "account.cadence": "Strategic cadence",
      "signal.triage": "Signal triage",
      "pricing.discount_approval": "Discount approval",
      "delivery.payment_risk": "Payment risk",
      "campaign.return": "Campaign return",
    } as Record<string, string>,
    dealsOpen: "open",
    dealsWorth: "worth",
    plans: "plans",
    campaigns: "campaigns",
    targets: "targets",
    territories: "territories",
    accounts: "accounts",
    signals: "signals",
    leads: "leads",
    projects: "projects",
    // English groups by thousands, Chinese by 万. Not a translated word but a
    // different way of cutting the number - see the note this replaces.
    wan: (amount: number) =>
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount),
    expand: (title: string) => `Expand ${title}`,
    collapse: (title: string) => `Collapse ${title}`,
    boardLabel: "Board overview",
    resource: "My resources",
    productLines: "Product lines - open",
    needsApproval: "discounts pending",
    allies: "Allies - decision chain",
    alliesCoaches: "coaches built",
    alliesUnreachable: "decision-makers untouched",
    alliesBlockers: "blockers",
    playbooks: "playbooks available",
    quota: (period: string) => `${period} target`,
    quotaWon: "Won",
    quotaTarget: "Target",
    quotaOf: "Attained",
    quotaLeft: (pct: number) => `${pct}%`,
    coverage: "Coverage gap",
    poolRow: (period: string) => `${period} pool`,
    coverageOf: (pct: number) => `${pct}%`,
    coverageGap: (v: string) => `${v} short`,
    coverageThin: (floor: number) => `below the ${floor}% floor`,
    coverageMet: "Target met",
    agent: "Copilot",
    agentScope: (n: number) => `Watching ${n} accounts`,
    capture: "Write one down",
    ask: "Ask",
    attach: "Attach a file",
    notWired: "That capability is not connected yet",
    reconTitle: "Competition",
    reconEmpty:
      "Nothing scouted yet. Rivals appear only inside note text so far; there is no formed intelligence.",
    reconCta: "Run a competitive analysis",
    reconNote: 'The result enters the feed as a "model" judgement.',
    captureSend: "Save",
    capturePlaceholder: "Just got off the phone with Wang...",
    captureHelp:
      "Three sentences, a chat message, a forwarded email - all count. The original is kept verbatim.",
    pendingTitle: "For you today",
    recentTitle: "Recently recorded",
    sourceRule: "Rule",
    sourceModel: "Model",
    whenToday: "today",
    whenDaysAgo: (n: number) => `${n}d ago`,
    truncate: (t: string) => `${t}...`,
  },
};
