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
// COVERAGE, 2026-09-02: 99 of the 102 constants in messages.ts. Three are not
// here, and none of the three is merely overdue:
//
//   PINNED TO zh-CN BY CONSTRUCTION - PREVIEW_FIXTURES, PREVIEW_TEXT. They
//   belong to /product-preview, where a reviewer checking the two gates should
//   see the same screen whatever their own cookie says. Demo data, not product
//   copy, and translating them would be wrong rather than merely absent.
//
//   HELD BACK ON PURPOSE - TIER_LABEL. Tier names are COMMERCIAL NAMING, not
//   copy: what a tier is called in English is a decision about what is being
//   sold, and a translator inventing one would be naming a product. It waits
//   for that decision rather than for a spare afternoon.
//
// FORECAST_ERROR, PROJECT_ERROR and TARGET_ERROR were in the second group and
// are now translated. Codes they share with a sibling dictionary reuse that
// dictionary's sentence verbatim - one code should not have two readings.
//
// THIS COUNT USED TO BE A CLAIM AND IS NOW A TEST. It said "65 of the 67" and
// named two exceptions; the file had grown to 102 constants and six exceptions
// without the sentence moving. i18n/dictionary.test.ts asserts the exact set,
// so the next one to drift fails rather than being read and believed.
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
  // The generic fallback, and the reason it is not optional: components read
  // these as `DICT[code] ?? DICT.denied`, so without it an unregistered code
  // renders `undefined` to an English reader. zh has carried this key since the
  // dictionaries were consolidated; en had not, which made "complete by
  // construction" true of the top level only.
  denied: "The action was refused",
} as const;

const LOGIN_ACCOUNT_STATUS_LABEL_EN: Record<string, string> = { active: "Account active" };

export const en: Dictionary = {
  ...(zh as unknown as Dictionary),

  COMPLETENESS_ERROR: {
    ...GATE_ERROR,
    province_unknown:
      "The province must be one of the 34 provincial-level divisions - pick one from the list",
    industry_unknown:
      "Not one of this workspace's industries - add it under Industries first",
    code_required: "An industry needs a code",
    name_required: "An industry needs a name",
    not_found:
      "That customer record does not exist, or is not in this workspace.",
    field_not_fillable: "That is not a field the copilot may fill.",
    value_required: "Filling a field needs a value; a blank is not one.",
    nothing_to_ask: "Nothing on this record is a question for the assistant.",
    no_active_tenant:
      "This session carries no tenant, so the model plane cannot be reached.",
    tenant_required:
      "This session carries no tenant, so the model plane cannot be reached.",
    empty_question: "There was nothing to ask.",
    turn_failed:
      "The assistant could not answer this time. Nothing on this record changed.",
  },

  COMPLETENESS_TEXT: {
    title: "What this customer record is missing",
    description:
      "Two kinds of gap: what this workspace's own data can already work out, and what the assistant has to find. The first kind shows what it was read from - a fill that cannot say where the value came from is a machine signing your name on a customer record.",
    fill: "Fill in",
    fields: {
      province: "Province",
      region: "Region",
      industry: "Industry",
      segmentCode: "Segment",
      ownerSub: "Owner",
    },
    askable: (fields: string) =>
      `${fields} cannot be worked out from the data - those are facts about the company itself. The assistant looks them up, and its answer arrives as a proposal to accept.`,
    ask: "Ask the assistant",
    askedNote:
      "Asked. Its answer arrives as a proposal to accept - nothing is written to this record until somebody does.",
    joinFields: (fields: readonly string[]) => fields.join(", "),
    structural: {
      regionUnplaced:
        "No territory covers this region. The record itself is complete, but because nobody claims that ground this customer is visible to every territory member - the fix is the territory map, not this record.",
    } as Record<string, string>,
  },

  BATCH_COMPLETE_ERROR: {
    ...GATE_ERROR,
    province_unknown:
      "The province must be one of the 34 provincial-level divisions - pick one from the list",
    industry_unknown:
      "Not one of this workspace's industries - add it under Industries first",
    code_required: "An industry needs a code",
    name_required: "An industry needs a name",
    not_found:
      "That customer record does not exist, or is not in this workspace.",
    field_not_fillable: "That is not a field batch completeness fills.",
    value_required: "This suggestion was empty and was skipped.",
  },

  BATCH_COMPLETE_TEXT: {
    title: "Batch completeness",
    description:
      'Runs the same rule as "What this customer record is missing" across every customer - only the half the data can already work out, no model spend. Select, apply in bulk, and each write is still checked on its own permissions.',
    columnAccount: "Customer",
    columnField: "Field",
    columnSuggestion: "Suggested value",
    columnBasis: "Basis",
    selectionNoun: "suggestions",
    apply: "Apply selected",
    applying: "Applying",
    clearSelection: "Clear selection",
    emptyTitle: "Nothing the data can work out",
    emptyDescription:
      "Every field the data can derive is already filled, across every customer this workspace can see.",
    result: (applied: number, failed: number) =>
      failed > 0
        ? `Applied ${applied}, ${failed} failed - most often because someone else filled it first, or scope changed`
        : `Applied ${applied}`,
  },

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
    backUp: "Back",
    expandNav: "Expand navigation",
    collapseNav: "Collapse navigation",
    expandAllGroups: "Expand all groups",
    collapseAllGroups: "Collapse all groups",
  },

  DOMAIN_LABEL: {
    national: "Sales screen",
    strategy: "Market strategy",
    planning: "Sales planning",
    campaign: "Campaigns",
    account: "Accounts",
    signal: "Opportunity signals",
    lead: "Leads",
    funnel: "Funnel",
    segment: "Segments",
    solution: "Solutions",
    pricebook: "Product pricing",
    territory: "Territories",
    division: "Region settings",
    namedAccount: "Named accounts",
    quote: "Quotes",
    routing: "Lead routing",
    winLossReview: "Win/loss reviews",
    collection: "Collections",
    pipeline: "Pipeline",
    delivery: "Project delivery",
    copilot: "Copilot",
    catalog: "Catalogue",
    home: "Today's calls",
    queue: "Awaiting me",
    members: "Organisation",
    roles: "Roles",
    permissions: "Permission policy",
    scope: "Data scope",
    orgUnit: "Organization",
    product: "Product settings",
    winLossReason: "Win/loss reasons",
    industry: "Industries",
    forecastThreshold: "Forecast bands",
    ageingPolicy: "Ageing bands",
    pricingPolicy: "Pricing rules",
    audit: "Audit trail",
    adoption: "Adoption",
    renewal: "Renewals",
    forecastRule: "Forecast rules",
    attainment: "Attainment",
    // 权限策略 (owner, 2026-09-11): a placeholder module reserved in
    // settlement - no page, permission point or schema yet.
    contract: "Contracts",
  },

  // The five domain names are the product's loudest claim about itself, so
  // they are translated for STANCE, not word-for-word. 武备 is literally
  // "arms and materiel"; "Armory" carries the same idea in one English word,
  // where "Strategic products" would land back in the CRM register the Chinese
  // deliberately left.
  //
  // 战果沉淀域 -> "Consolidation" (2026-09-03, replacing "Settlement"). 沉淀 is
  // what settles OUT of a solution and stays; Settlement reads as accounting,
  // and this column is delivery, collection and renewal - making a win
  // permanent. Consolidation is the military word for exactly that phase:
  // holding what was taken. Two of the five now diverge from their key on
  // purpose - `position`/阵地经营域/"Frontline" and `settlement`/战果沉淀域/
  // "Consolidation" - because "Position" reads as a job and "Settlement"
  // reads as a ledger. The key is internal; these two words are not.
  //
  // NO SUFFIX HERE, while the Chinese took 域 back on 2026-09-04. This is the
  // asymmetry doing its job rather than a translation nobody finished.
  //
  // Chinese has no capital letters. Without the suffix, 阵地经营 and the module
  // 客户管理 beneath it were both four characters in the same register, and
  // nothing in the glyphs said one of them was the category and the other its
  // contents - so the category now says so, with 域. English marks a proper
  // name by capitalising it:
  // "Frontline" over "Accounts" is already two different KINDS of word on the
  // page, before any suffix. Adding "domain" would spend a word restating what
  // the capital already did, and would read like schema leaking into a menu.
  //
  // The rule this follows: translate what the reader needs, not what the other
  // locale contains. A key present in one language and absent in the other
  // would be drift; the same key rendering differently because the two writing
  // systems disambiguate differently is the whole reason there are two files.
  DOMAIN_GROUP_LABEL: {
    armory: "Armory",
    deployment: "Deployment",
    recon: "Reconnaissance",
    position: "Frontline",
    settlement: "Consolidation",
  },

  NAMED_ACCOUNT_TEXT: {
    why: "The strategic account list. It decides who signal scouting watches and whose contact cadence is judged hardest.",
    tagNamed: (n: number) => `${n} named accounts`,
    none: "No named accounts yet",
    noneWhy:
      "Mark an account strategic or key on its own page and it appears here. The tier is set where the evidence for setting it is - health, decision chain and open deals are all on that page.",
  },
  ROUTING_TEXT: {
    title: "Lead routing",
    why: "Territory first, then load (owner ruling, 2026-08-30). Territory decides who is allowed to work it; load decides which of them should. Reverse the order and an idle rep gets ground they have never worked.",
    none: "No leads awaiting assignment",
    noneWhy:
      "Converted and disqualified leads are absent - their ownership is settled.",
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
    basisSole: (region: string, territory: string) =>
      `${region} is covered by ${territory}, and by nobody else`,
    basisTie: (region: string, n: number, territory: string, load: number) =>
      `${region} has ${n} owners; ${territory} carries the fewest open leads (${load})`,
    openAccount: "Open customer record",
    colRegion: "Region",
    noRegion: "no region",
    // 智能分配 - see the note on the zh catalogue.
    // The router's own counts - see the zh catalogue.
    tagOpen: (n: number) => `${n} open`,
    tagPending: (n: number) => `${n} to assign`,
    tagBlocked: (n: number) => `${n} unplaceable`,
    assignTitle: "Suggested assignments",
    adviceNoRegion: (n: number) =>
      `${n} have no region: no account matched, or the record has none. The rule cannot start.`,
    adviceNoTerritory: (n: number) =>
      `${n} sit in a region no active territory covers - a piece missing from the map.`,
    adviceNoOwner: (n: number) =>
      `${n} are covered by a territory nobody runs. The map is complete; the staffing is not.`,
    adviceImbalance: (who: string, n: number, share: number) =>
      `Accepting everything leaves ${who} holding ${n} - ${share}% of the queue. Fine if they own that ground alone.`,
    blockedTitle: "Could not place",
    assignIdle:
      "Run the rule over the open leads and see which should change hands. The result is a proposal; accepting is yours.",
    assignRun: "Suggest assignments",
    assignAgain: "Analyse again",
    assignDiscard: "Discard",
    assignAccept: "Accept",
    assignFound: (n: number) => `${n} suggested`,
    assignNone: "Nothing to move - every lead is already where the rule would put it.",
    assignAllDone: "All suggestions handled.",
    assignMove: (from: string, to: string) => `${from} -> ${to}`,
  },
  RENEWAL_TEXT: {
    title: "Renewals",
    why: "Subscription projects appear here 90 days before their term ends (owner ruling, 2026-08-30: derived from the project, and only for subscriptions). One-off deliveries are absent - they finished when they were handed over, and inventing a renewal for one chases an obligation the customer never took on.",
    none: "No subscription terms coming up",
    noneWhy:
      "One-off projects never renew; a subscription appears 90 days before its term ends.",
    colProject: "Project",
    colEnds: "Term ends",
    colAmount: "Last term",
    colAnalysis: "Opportunity read",
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
      no_end_date:
        "subscription with no end date - this renewal will be missed",
      too_far_out: "outside the 90-day window",
      not_delivering: "not started, or terminated - no term to extend",
      already_renewed: "a renewal deal is already running",
    } as Record<string, string>,

    rosterDue: "Coming up for renewal",
    rosterDueWhy:
      "Subscription projects whose term is running out. Opening one is a commercial approach to a customer, so it is done a row at a time.",
    rosterNotDue: "Not due",
    rosterNotDueWhy:
      "Outside the window, already renewed, or never a subscription. They stay because one of those reasons is a defect: a subscription with no end date will never surface at all.",
    tagRenewalDue: (n: number) => `${n} due`,
    tagRenewalLapsed: (n: number) => `${n} lapsed`,
    tagRenewalWatch: (n: number) => `${n} with delivery risk`,
    renewalStatDays: (days: number) => `${days} days to term end`,
    renewalStatLapsed: (days: number) => `${days} days past term end`,
    renewalStatNoDate: "no end date",
    renewalStatEmpty: "Nothing is coming up for renewal, so there is nothing to break down.",

    renewalAdviceTitle: "Renewal check",
    renewalAdviceClear: "Nothing on these projects needs attention.",
    viewDelivery: "See delivery",
    renewalAdviceOpenAccounts: "See accounts",
    renewalAdviceAct: "Open the renewal",
    renewalAdviceActed: "Renewal opportunity opened",
    renewalAdviceLapsed: (name: string, days: number) =>
      `"${name}" ended its term ${days} days ago and no renewal is open.`,
    renewalAdviceWatch: (name: string) =>
      `"${name}" is coming up, but delivery itself is shaky - look at the delivery before the renewal.`,
    renewalAdviceNoEndDate: (name: string) =>
      `"${name}" is a subscription with no end date, so its renewal will never surface on its own.`,
    renewalAdviceNoAmount: (name: string) =>
      `"${name}" is coming up and there is no contract amount to carry forward.`,
    renewalAdviceDueSoon: (name: string, days: number) =>
      `"${name}" has ${days} days left on its term and can be renewed now.`,
    rowCount: (n: number) => `${n} due`,
    searchHint: "Project name or number",
    filterAllRisk: "All renewal risk",
    riskLow: "Delivery on track",
    riskWatch: "Delivery at risk",
    riskNone: "Not assessed",
    narrowedNote: "Narrowed by the search above",
  },
  RENEWAL_ERROR: {
    // incr/0034 - the deal entry gate.
    owner_required: "A deal needs somebody to own it.",
    requirement_required: "A deal has to say what the customer wants.",
    ...GATE_ERROR,
    renewal_not_due:
      "This project is not due for renewal - the page may be stale, reload and look again",
    name_required: "a deal needs a name",
    account_required: "a deal needs a customer",
    amount_negative: "a deal amount cannot be negative",
    not_found: "That project does not exist, or is not in this workspace",
  },
  FORECAST_RULE_TEXT: {
    title: "Forecast rules",
    why: "Where the rule would file each deal, beside where a person filed it (owner ruling, 2026-08-31: suggest only, applied one deal at a time). The disagreement is what a forecast review is about - and until now it could only be found by reading the board deal by deal.",
    none: "No open deals",
    noneWhy:
      "Won and lost deals have their category bound to the stage. That is not a judgement, so there is no second opinion to offer.",
    colDeal: "Deal",
    colFiled: "Filed as",
    colSuggested: "Rule says",
    colBasis: "Because",
    colStage: "At stage",
    colApply: "Apply",
    agrees: "agrees",
    apply: "File as this",
    applied: "Filed",
    denied:
      "You can see the disagreement but cannot change the forecast category - a split the product draws on purpose: you own the deal, not the forecast commitment.",
    basisHuman: (p: number) => `${p}% win rate (theirs)`,
    basisDefault: (p: number) => `${p}% win rate (stage default)`,
    stalledFor: (days: number) => `${days} days, no move`,
    neverMoved: "no stage history",
    cap: {
      no_close_date:
        "no expected close date - nothing to commit to without a period",
      close_date_passed: "the close date passed and the deal is still open",
      stalled: "sat at this stage too long; one band down",
    } as Record<string, string>,

    rosterDisputed: "Where the rule disagrees",
    rosterDisputedWhy:
      "Deals the rule and the person filed differently. The disagreement is what a forecast review is for - and which way it leans is the first thing to read.",
    rosterAgreed: "No disagreement",
    rosterAgreedWhy:
      "The rule and the filing agree, or the deal is settled and has no judgement to argue with. They stay because a page of nothing but disagreements reads as \"these are the problem deals\" rather than as \"this is the forecast\".",
    noneDisputed: "The rule agrees on every deal",
    noneDisputedWhy: "Nothing here needs a second opinion.",
    filedOptimistic: "filed surer",
    filedConservative: "filed less sure",
    tagForecastDisputed: (n: number) => `${n} disputed`,
    tagForecastOptimistic: (n: number) => `${n} filed surer`,
    forecastStatCount: (n: number) => `${n} deals`,
    forecastStatEmpty: "No forecastable deals yet, so there is nothing to break down.",

    analysisTitle: "Forecast analysis",
    analysisWhy:
      "The shape first: which category the book sits in, which way the disagreements lean, and how much money is in each. The list below is the detail.",
    chartPeak: "Peak",
    analysisEmpty: "Nothing to plot yet.",
    agreementRate: "Rule and filing agree",
    agreementOf: (n: number, total: number) => `${n} of ${total}`,
    agreementWhy: (n: number) =>
      `${n} disagree. The count only means something against the total: twelve out of two hundred is a healthy forecast with a few edges, twelve out of twenty is one nobody trusts.`,
    agreementClear: "The rule agrees with every filing.",
    byCategoryTitle: "By category",
    byCategoryWhy: "Value at each filed category, least sure to most sure.",
    directionTitle: "Which way they lean",
    directionWhy:
      "Filed surer than the rule inflates a number somebody will be held to; filed less sure hides work that is going well. Two different conversations.",
    directionNone: "No disagreements, so there is nothing to plot.",
    dirOptimistic: "Filed surer",
    dirConservative: "Filed less sure",

    adviceTitle: "Forecast check",
    adviceClear: "The rule agrees with every filing here.",
    adviceOpenDeal: "Open the deal",
    adviceOptimistic: (name: string, filed: string, suggested: string) =>
      `"${name}" is filed ${filed}; the rule only reaches ${suggested} - this one is inflating the commitment.`,
    adviceConservative: (name: string, filed: string, suggested: string) =>
      `"${name}" is filed ${filed}; the rule would reach ${suggested} - this one's progress is understated.`,
    rowCount: (n: number) => `${n} disputed`,
    searchHint: "Deal name or number",
    filterAllFiled: "All categories",
    narrowedNote: "Narrowed by the search above",
  },
  FORECAST_RULE_ERROR: {
    ...GATE_ERROR,
    category_settled: "A won or lost deal has its category bound to the stage",
    category_already_agrees:
      "This deal is already filed where the rule would put it",
    closed_requires_terminal_stage:
      "The deal is still open and cannot be forecast as closed",
    terminal_requires_closed: "A closed deal can only be forecast as closed",
    unknown_forecast_category: "Unknown forecast category",
    empty_patch: "Nothing was changed",
    not_found: "That deal does not exist, or is not in this workspace",
    probability_range: "Win rate must be a whole number between 0 and 100",
    terminal_probability_fixed:
      "A closed deal has a fixed win rate and cannot be changed",
    amount_negative: "The amount cannot be negative",
  },
  // D6 forecast snapshots. Four codes here also live in FORECAST_RULE_ERROR
  // above and read identically on purpose: one code, one sentence, wherever a
  // reader meets it.
  FORECAST_ERROR: {
    ...GATE_ERROR,
    period_required: "A snapshot must say which period it is for",
    period_unparsed: "That period is not written in a form we recognise",
    currency_mismatch: "The currency does not match the deal's",
    unknown_forecast_category: "Unknown forecast category",
    unknown_scope_type: "Unknown scope type",
    scope_incomplete:
      "This scope is missing something it needs, so there is no saying who it covers",
    scope_overspecified: "This scope names two things that rule each other out",
    closed_requires_terminal_stage:
      "The deal is still open and cannot be forecast as closed",
    terminal_requires_closed: "A closed deal can only be forecast as closed",
  },
  TARGET_ERROR: {
    ...GATE_ERROR,
    name_required: "A target needs a name",
    period_required: "A target must say which period it is for",
    unknown_metric: "Unknown metric",
    unknown_status: "Unknown target status",
    count_not_integer:
      "A count metric is a whole number - there is no fraction of a customer",
    unit_mismatch: "That unit does not belong to this metric",
    amount_negative: "The amount cannot be negative",
    currency_mismatch: "The currency does not match the parent target's",
    scope_incomplete:
      "This scope is missing something it needs, so there is no saying who it covers",
    scope_overspecified: "This scope names two things that rule each other out",
    scope_immutable:
      "A target's scope is fixed once it is set - a different scope is a different target",
    duplicate_scope: "There is already a target for this period and this scope",
    target_closed:
      "This target is closed - it is the record the period was measured against",
    status_regression: "A target's status cannot move backwards",
    parent_not_found: "The parent target does not exist",
    parent_cycle:
      "A target cannot become its own parent, directly or through a chain",
    not_found: "That target does not exist, or is not in this workspace",
  },
  ATTAINMENT_TEXT: {
    title: "Attainment",
    why: "What the period promised, how much has landed, and how much is behind it - three readings that only mean something together. They used to sit on the board as three cards belonging to no module.",
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
    noComposition:
      "Open deals carry no lines yet, so there is nothing to break down",
  },
  AUTONOMY_TEXT: {
    title: "Assistant authority",
    why: "How far this assistant may go before it asks you. What changes is which decisions still pass through your hands one at a time - not whether it may propose. It only ever proposes; accepting is what moves data (ADR-003).",
    modeLabel: "Authority",
    modes: {
      ask_high_risk: "Ask me about the risky ones",
      ask_always: "Ask me about everything",
      autonomous: "Run unattended",
    } as Record<string, string>,
    modeWhy: {
      ask_high_risk:
        "It does what can be walked back on its own, because those leave a trail. What cannot be taken back, and what it is unsure of, still comes to you.",
      ask_always:
        "Every proposal waits for you. This is where a workspace that has never opened this setting stands: not set is not authorised.",
      autonomous:
        "Everything runs, outreach included. The record says nobody signed.",
    } as Record<string, string>,
    risk: {
      irreversible: "cannot be taken back",
      low_confidence: "not confident enough",
    } as Record<string, string>,
    modeCanDo: (actions: string) => `Right now it performs: ${actions}.`,
    modeCanDoNone: "Right now it performs nothing on its own.",
    riskWhy: (floor: number) =>
      `Cannot be taken back = anything that reaches the customer. Not confident enough = under ${floor}%, or no figure given. Either one asks you.`,
    unset: "not set",
    setBy: (who: string) => `set by ${who}`,
    save: "Switch to this",
    saved: "In effect",
    denied:
      "You do not have permission to change the assistant's authority - deciding one proposal and deciding that proposals no longer need deciding are different acts.",
  },
  AUTONOMY_ERROR: {
    ...GATE_ERROR,
    unknown_autonomy_mode: "Unknown authority level",
  },
  QUOTE_TEXT: {
    tagCount: (n: number) => `${n} quotes`,
    title: "Quotes",
    why: 'What each deal is currently offering. The lines, the floor and the signature all existed; nothing put them together, so "what did we quote this customer" meant opening one deal at a time.',
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

  // Empty, like the Chinese: every module is built. See messages.ts for why
  // the ten entries that used to sit here were a liability rather than a
  // fallback.
  PLANNED_MODULE_LABEL: {},

  LAUNCHER_TEXT: {
    locked: (tier: string) => `${tier} plan`,
    lockedNoTier: "unavailable",
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
    unit_required:
      "A unit is required - a quantity with no unit cannot say what was sold",
    items_required: "A solution with no products is just a name",
    all_optional: "Keep at least one standard line - all-optional is a menu, not a solution",
    product_not_found: "Product not found - the page may be stale, refresh it",
    quantity_positive: "The quantity must be above zero",
    duplicate_product:
      "That product appears twice - use one line with the total",
    product_required: "Pick a product",
    currency_required: "A currency is required",
    amount_negative: "A price cannot be negative",
    floor_above_list:
      "A floor above list would make every sale need approval, which is the same as having no floor",
    status_unchanged: "Already in that status",
    development_is_birth_state:
      "Development is a birth behaviour: a product starts there, and cannot slide back",
    type_in_use: "Products still carry this type - retire it instead of deleting",
    type_not_found: "Product type not found - the page may be stale, refresh it",
    status_not_found: "Status not found - the page may be stale, refresh it",
    born_shelved: "A product cannot be created already retired",
    system_status: "The three built-in statuses never delete - rename, describe, reorder them",
    status_in_use: "Products still carry this status - move them first",
    unit_not_found: "No such unit - the page may be stale, reload it",
    unit_in_use: "Products are still priced in this unit - move them to another one first",
    product_in_use:
      "Quote lines or solutions still reference this product - retire it instead of deleting",
    move_at_edge: "Already at that end of the list",
    not_found: "Record not found - the page may be stale, refresh it",
    not_movable: "This row is not in the list being ordered",
    price_in_force: "This is the price the product is quoted at - re-price instead of deleting",
    price_signed: "A discount signature cites this floor; deleting it would leave the signature unexplained",
    denied: "Refused",
  },

  ASSIST_TEXT: {
    title: "Smart fill",
    description: "Suggestions computed from what this workspace already knows. Each states its evidence; nothing applies until you click it.",
    nothing: "Nothing to suggest yet.",
    apply: "Apply",
    newEntry: "New",
    titleKnown: (t: string) => `Existing title spelling: ${t}`,
    departmentKnown: (d: string) => `Existing department: ${d}`,
    vocabularyWhy: "Reusing this customer's existing spellings keeps per-title and per-department rollups in one piece.",
    codeNext: (code: string) => `Suggested code: ${code}`,
    codeNextWhy: "The next number in the series your existing codes follow.",
    categoryKnown: (c: string) => `Existing category: ${c}`,
    categoryKnownWhy: "Reusing an existing category keeps reports that group by it in one piece.",
    unitKnown: (u: string) => `Common unit: ${u}`,
    unitKnownWhy: "The unit your catalogue uses most.",
    bundleAdd: (name: string) => `Add ${name}`,
    bundleAddWhy: "Active products not yet in this solution.",
    unpriced: (name: string) => `${name} has no price yet`,
    unpricedWhy: "A product without a price cannot be quoted - the gap this page exists to close.",
    floorRatio: (floor: string) => `Suggested floor: ${floor}`,
    floorRatioWhy: (pct: number) =>
      `From the median floor ratio of your existing prices (about ${pct}% of list). The floor is a commercial decision - this fills the field, you still sign it.`,
    periodKnown: (p: string) => `Existing period: ${p}`,
    periodKnownWhy: "Reusing the existing spelling keeps period-grouped reports in one piece.",
    industryKnown: (v: string) => `Industry your customers carry: ${v}`,
    regionKnown: (v: string) => `Region your customers carry: ${v}`,
    criteriaWhy: "A segment cuts the actual market - criteria built from values customers really carry cut something rather than nothing.",
    uncoveredRegion: (region: string, n: number) => `${region} has ${n} customer(s) and no territory coverage`,
    uncoveredRegionWhy: "Leads route territory-first. Ground no territory covers is ground where every lead is unroutable.",
    metricUnset: (label: string) => `No workspace target for "${label}" this period`,
    metricUnsetWhy: "A metric with no target is one attainment cannot judge - the denominator is missing.",
    territoryUnset: (name: string) => `${name} has no target at all this period`,
    territoryUnsetWhy: "An untargeted territory reads as \"not established\", not zero - this points at the blank, the number is yours.",
    campaignEmpty: (name: string) => `${name} has no execution items yet`,
    campaignEmptyWhy: "Executions are what a campaign is made of: completion needs them cleared, return counts them. Running with none means the activity has not been broken into work.",
    assigneeKnown: (v: string) => `Common assignee: ${v}`,
    assigneeKnownWhy: "Reusing the existing spelling keeps per-person rollups in one piece.",
    projectUnchecked: (name: string) => `${name} has no milestones`,
    projectUncheckedWhy: "A project with no milestones has a health nobody can contradict - self-reported and uncheckable.",
    sequenceNext: (n: number) => `Suggested sequence: ${n}`,
    sequenceNextWhy: "The next number in this project's own series. Holes are left alone - a skipped number is usually deliberate.",
    accountNoDeal: (name: string) => `${name} has no open deal`,
    accountNoDealWhy: "Worked but not sold to - corridor deals tend to surface at exactly these customers.",
    territoryCovers: (name: string, region: string) => `${name} covers ${region}`,
    territoryCoversWhy: "The same region match lead routing runs - filed this way, the deal lands where its leads would have.",
  },
  ASSISTANT_TEXT: {
    actFailed: "That did not go through.",
    ignore: "Ignore",
    ignored: (n: number) => `${n} ignored`,
    accept: "Accept",
  },
  CATALOG_TEXT: {
    productNoun: "product",
    solutionNoun: "solution",
    statusNoun: "status",
    typeNoun: "type",
    unitNoun: "unit",
    newProduct: "New product",
    newProductWhy: "A product is the catalogue's atom: quote lines and solution items both point at one.",
    newSolution: "New solution",
    newSolutionWhy: "A solution is a bundled way of selling products. An empty one is just a name - add at least one.",
    newPrice: "Set a price",
    newPriceWhy: "The list price is what we say; the floor is the discipline - a line below it is flagged for approval.",
    newEntry: "New",
    solutionSummary: "One-line summary",
    solutionProduct: "Product",
    solutionQuantity: "Quantity",
    pickProduct: "Pick a product",
    addItem: "Add a line",
    removeItem: "Remove",
    saveSolution: "Save solution",
    solutionSaved: "Saved",
    description:
      "The catalogue is the dimension every domain references: deals, contracts, delivery and signal matching all read it, and it writes to none of them.",
    lead: (n: number) => `${n} products on sale`,
    leadWhy:
      "You cannot sell anything without knowing what you sell - so the catalogue is not sold by tier and every tier can read it.",
    products: "Products",
    productsWhy:
      'A single product or service. The unit is not decoration: every line multiplies quantity by unit price, and "10 x 1000" with no unit is ten seats, ten days or ten sites - three different deals.',
    colCode: "Code",
    colName: "Name",
    colCategory: "Category",
    colUnit: "Unit",
    colStatus: "Status",
    statusActive: "On sale",
    statusRetired: "Retired",
    statusDev: "In development",
    noCategory: "Uncategorised",
    addProduct: "Add or update a product",
    saveProduct: "Save product",
    productSaved: "Saved",
    codeHint:
      "Keyed by code: saving the same code again edits it rather than adding a second",
    tagActive: (n: number) => `${n} on sale`,
    tagDev: (n: number) => `${n} in development`,
    settingsLink: "Catalogue configuration",
    byTypeCollapse: "Collapse the type breakdown",
    byTypeExpand: "Expand the type breakdown",
    byTypeEmpty: "No products yet - the breakdown starts with the first one",
    typeStat: (active: number, dev: number) =>
      dev > 0 ? `${active} on sale · ${dev} in development` : `${active} on sale`,
    rosterLive: "Products",
    rosterLiveWhy: "On sale and in development. The order is the storefront - what customers see is decided here.",
    rosterRetired: "Retired products",
    rosterRetiredWhy:
      "Retirement is shelving, not deletion: a product referenced by quote lines or solutions cannot be deleted, and its history stays readable here.",
    colType: "Type",
    colUnitPrice: "Unit",
    colOps: "Actions",
    opEdit: "Edit",
    opLaunch: "Launch",
    opRetire: "Retire",
    opReinstate: "Back on sale",
    opDelete: "Delete",
    opUp: "Move up",
    opDown: "Move down",
    deleteConsequence: "Deletion is permanent and clears the price history. A referenced product is refused - retire it instead.",
    editProduct: "Edit product",
    editHint: "The code is the identity and cannot change; status moves through the roster's row actions, not here",
    newStatus: "Initial status",
    newStatusWhy: "A product in development is real but not quotable; launching moves it into the sellable roster",
    sortTitle: "Current catalogue order",
    sortWhy: "A new product joins at the end. Move it into place - this order is the one customers see.",
    settingsTitle: "Catalogue configuration",
    unitsTitle: "Pricing units",
    unitsWhy: "What a product is sold by: sets, person-days, years. Quote lines count in it.",
    addUnit: "New unit",
    renameUnit: "Rename",
    saveUnit: "Save unit",
    unitCode: "Unit code",
    unitCodeHint: "Fixed once created - it is this unit's anchor. Lowercase ASCII, e.g. set / month.",
    colUnitName: "Unit",
    unitDeleteConsequence: "Refused while products are priced in it - move them to another unit first.",
    back: "Back",
    typesTitle: "Product types",
    typesWhy: "What kind of product this is. Cannot be deleted while in use; can be retired.",
    typeCode: "Type code",
    typeName: "Type name",
    typeCodeHint: "The code is this workspace's business anchor and cannot change; internal joins are uuids and never display",
    addType: "New type",
    renameType: "Rename",
    saveType: "Save type",
    typeDeleteConsequence: "Deletion is permanent. Refused while products carry the type - retire it in that case.",
    colTypeName: "Type name",
    colTypeStatus: "Type state",
    colStatusName: "Status name",
    colStatusDesc: "Status description",
    colLinkedProducts: "Linked products",
    linkedCount: (n: number) => `${n}`,
    typeEffectiveBadge: "Effective",
    typeRetire: "Retire",
    typeReinstate: "Reinstate",
    typeRetiredBadge: "Retired",
    typeInUse: (n: number) => `${n} products`,
    statusesTitle: "Product statuses",
    statusesWhy: "What stage a product is at: in development, on sale, retired.",
    addStatus: "New status",
    renameStatus: "Rename",
    saveStatus: "Save status",
    statusCode: "Status code",
    statusCodeHint: "The code is this workspace's business anchor and cannot change; internal joins are uuids and never display",
    moveToStatus: (label: string) => `Move to "${label}"`,
    statusDeleteConsequence: "Deletion is permanent. The three built-in statuses never delete; refused while products carry the status.",
    tagSolutionActive: (n: number) => `${n} in use`,
    tagSolutionRetired: (n: number) => `${n} retired`,
    solutionStat: (inSolution: number, outside: number) =>
      outside > 0 ? `${inSolution} in a solution · ${outside} not` : `${inSolution} in a solution`,
    solutionStatEmpty: "No products on sale yet - coverage starts with the first one",
    rosterSolution: "Solutions",
    rosterSolutionWhy:
      "A solution is a product combination plus its customisation. The order is the storefront; the combination is edited on the solution's own page.",
    rosterSolutionRetired: "Retired solutions",
    rosterSolutionRetiredWhy:
      "A retired solution is no longer quoted from, but it records how something used to be sold, so it is kept.",
    colSolutionName: "Solution",
    colComposition: "Combination",
    colScenario: "Scenario",
    compositionCount: (standard: number, optional: number) =>
      optional > 0 ? `${standard} standard · ${optional} optional` : `${standard} standard`,
    noScenario: "Not stated",
    solutionRetire: "Retire",
    solutionReinstate: "Reinstate",
    solutionDeleteConsequence:
      "Deletion is permanent and takes the combination with it. Deals quoted from it are unaffected - quote lines reference products.",
    newSolutionEntry: "New solution",
    editSolution: "Edit solution",
    colOptional: "Standard / optional",
    optionalYes: "Optional",
    optionalNo: "Standard",
    colItemNote: "Customisation",
    scenarioHint: "The customer and situation this solution is shaped for",
    summaryHint: "One line on what this solution solves",
    itemNoteHint: "What is tailored here: how the quantity is worked out, what development is included",
    standardCoreHint: "Keep at least one standard line - all-optional is a menu, not a solution",
    solutionAdviceTitle: "Solution check",
    solutionAdviceClear: "Nothing to act on in the solutions in use.",
    solutionAdviceRetired: (s: string, p: string) => `${p} in ${s} is no longer on sale - a quote would carry a withdrawn product.`,
    solutionAdviceUnquotable: (s: string, p: string) => `${p} in ${s} is not quotable yet, so a quote from it is a line short.`,
    solutionAdviceUnpriced: (s: string, p: string) => `${p} in ${s} has no price, so a quote from it is a line short.`,
    solutionAdviceNoScenario: (s: string) => `${s} states no scenario - a combination without one is a package, not a solution.`,
    solutionAdviceUncovered: (p: string) => `${p} is on sale, but no solution takes it to market.`,
    solutionAdviceOpen: "Open the solution",
    solutionAdviceOpenCatalogue: "Open the catalogue",
    solutions: "Solutions",
    solutionsWhy:
      "Quoting templates. Lines never reference one for calculation (ADR-014 s4) - a template is a starting point, not the authority.",
    solutionItems: (n: number) => `${n} products`,
    noSolutions: "No solutions yet",
    emptyBundle: "A solution with no products is just a name",
    pricebookLink: "Open the price book",
    pricebookWhy:
      "The floor is why this table exists: a quote below it needs a signature. Prices are appended, never rewritten - the superseded row is what explains how today's number was arrived at.",
    tagPriced: (n: number) => `${n} priced`,
    tagUnpriced: (n: number) => `${n} unpriced`,
    priceStat: (priced: number, unpriced: number) =>
      unpriced > 0 ? `${priced} priced · ${unpriced} unpriced` : `${priced} priced`,
    priceStatEmpty: "No products yet - the pricing breakdown starts with the first one",
    priceCurrent: "Current prices",
    priceCurrentWhy: "The row in force for each product. The floor is the discipline: a quote below it needs a signature.",
    priceHistory: "Superseded prices",
    priceHistoryWhy: "Prices that were replaced. They explain how today's number was arrived at, so they are kept rather than deleted.",
    reprice: "Re-price",
    repriceWhy: "Prices are appended, never rewritten: saving makes this the product's current price and moves the old one to history.",
    colProduct: "Product",
    adviceTitle: "Pricing assessment",
    adviceScopeAll: "All prices in force",
    adviceScopeSelection: "Selected rows",
    adviceClear: "Nothing to act on in these prices.",
    adviceRunAll: "Assess every price",
    adviceAccept: "Accept",
    adviceIgnore: "Ignore",
    adviceIgnored: (n: number) => `${n} ignored`,
    adviceApplied: "The suggested price was appended",
    adviceUnpriced: (name: string) => `${name} is on sale with no price, so it cannot be quoted.`,
    adviceOverridden: (name: string, n: number) =>
      `${name} has ${n} signatures below its floor - the floor may be set too high.`,
    adviceOutlier: (name: string, actualPct: number, medianPct: number) =>
      `${name}'s floor is ${actualPct}% of list; the median across other products is ${medianPct}%.`,
    adviceEqual: (name: string) =>
      `${name}'s floor equals list, meaning no discount - confirm that is the stance and not a gap.`,
    adviceApplyFloor: (floor: string) => `Floor ${floor}, at the median ratio`,
    adviceNoNumber: "No number to accept here",
    adviceNoNumberWhy: "A list and floor need a person; the analysis can only name the gap",
    adviceOpenCatalogue: "Open the catalogue",
    adviceOpenHistory: "See superseded prices",
    assessSelected: "Pricing assessment",
    analyzeSelectedHint: "Tick the prices to assess first",
    priceTrend: "Price movement",
    priceTrendSoon: "Price movement analysis is in development: the lineage is being recorded, the screen is not connected yet",
    priceInForceHint: "The price in force cannot be deleted - re-price to append a new one",
    priceDeleteConsequence: "Deletion is permanent. An entry cited by a discount signature is refused - that row is what the signature stands on.",
    listHint: "The price quoted to customers",
    floorHint: "The lowest price that can close. Equal to list means this product is not discounted.",
    colList: "List",
    colFloor: "Floor",
    colCurrency: "Currency",
    colEffective: "Effective",
    colSuperseded: "Superseded",
    noPrices: "No prices yet",
    setPrice: "Save price",
    priceSaved: "Recorded",
    floorEqualsList:
      "Floor equal to list = this product is not discountable. That is a position, not a typo",
    priceDenied:
      "You cannot set prices - whoever moves the floor can approve every discount in the product",
    writeDenied: "You cannot maintain the catalogue",
    productCount: (n: number) => `${n} products`,
    productSearchHint: "Product name or code",
    solutionCount: (n: number) => `${n} solutions`,
    solutionSearchHint: "Name, code, scenario",
    filterAllTypes: "All types",
    narrowedNote: "Narrowed by the search above",
    priceCount: (n: number) => `${n} prices`,
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

  BUYING_ROLE_TEXT: {
    title: "Buying roles on this deal",
    description:
      "Who signs, who evaluates, who can introduce you - all of it is relative to this purchase. The same person can be something else on another deal.",
    person: "Person",
    pickPerson: "Choose a person",
    role: "Role on this deal",
    influence: "Influence on this deal 0-100",
    save: "Save role",
    saved: "Saved",
  },
  WAR_ROOM_TEXT: {
    title: "Situation verdict",
    allClear: "All five checks pass. Nothing needs attention.",
    findings: (n: number) => `${n} finding(s); the actionable ones are ranked below.`,
    cell: {
      stage: "Stage",
      forecast: "Forecast",
      chain: "Decision chain",
      commitment: "Commitments",
      price: "Price",
    } as Record<string, string>,
    stageMoving: (stage: string, days: number | null) =>
      days === null ? "Moving" : `Day ${days} at this stage`,
    stageStalled: (stage: string, days: number) => `Sitting ${days} days - past the 45-day stall line`,
    stageTerminal: (stage: string) => (stage === "won" ? "Won" : "Closed"),
    forecastAgrees: (c: string) => "Agrees with the rule",
    forecastDisagrees: (filed: string, suggested: string) => "Filed category disagrees with the rule",
    forecastSettled: "Settled by the stage",
    forecastWhy: (caps: readonly string[], p: number, human: boolean) => {
      const capText = caps
        .map((c) => (c === "stalled" ? "stalled" : c === "no_close_date" ? "no close date" : "close date passed"))
        .join(", ");
      return `${human ? "self-reported" : "stage-default"} probability ${p}%${capText ? `; capped by: ${capText}` : ""}`;
    },
    chainHealthy: (coaches: number) => `Roles covered, ${coaches} coach(es)`,
    chainMissing: (roles: readonly string[]) => `${roles.length} required role(s) missing`,
    chainUnreachable: "Nobody can introduce you to the buyer",
    chainUnstated: "No buying roles stated on this deal yet",
    commitmentClear: (open: number) => (open === 0 ? "No open commitments" : `${open} open, none overdue`),
    commitmentOverdue: (ours: number, theirs: number) =>
      ours > 0 && theirs > 0
        ? `${ours} of ours overdue, ${theirs} of theirs`
        : ours > 0
          ? `${ours} of ours overdue`
          : `${theirs} of theirs overdue`,
    priceClean: (lines: number) => (lines === 0 ? "No lines yet" : "No discounts pending"),
    pricePending: (n: number) => `${n} line(s) below floor awaiting approval`,
    applyCategory: (label: string) => `Refile as "${label}" per the rule`,
    applyCta: "Apply the rule's category",
    applied: "Applied",
    applyCategoryReason: (basis: string) =>
      `Rule basis: ${basis}. The server re-derives it and refuses if the facts have moved.`,
    settleTitle: (statement: string) => `Settle: ${statement}`,
    settleReason: (direction: string, days: number) =>
      direction === "we_owe"
        ? `Our promise is ${days} day(s) overdue - it debits reliability and it is hanging at the customer.`
        : `Their promise is ${days} day(s) overdue - worth asking.`,
    settleMet: "Met",
    settleMissed: "Missed",
    settled: "Settled",
    stateRolesTitle: "State this deal's buying roles",
    stateRolesReason:
      "Who signs and who can introduce you are questions about THIS purchase - every judgement rule reads from here.",
    stateRolesCta: "Go state them",
    approveTitle: (n: number) => `${n} line(s) below the floor await a signature`,
    approveReason: (n: number) =>
      "The floor exists to constrain whoever is closing; signing happens looking at the line.",
    approveCta: "Review line by line",
    proposalsTitle: (n: number) => `The copilot has ${n} queued proposal(s) on this deal`,
    adjudicateReason: (n: number) =>
      "Accepting executes (ADR-003: the copilot proposes, a human decides). Read each, decide each.",
    acceptAndExecute: "Accept & execute",
    accepted: "Accepted",
    toQueue: "See all in the queue",
    adjudicateFailed: "Adjudication failed - see the queue page for why",
    analyseTitle: "Analyse this deal",
    analyseReason:
      "Hand the copilot this deal's stage, chain, commitments and lines for a deep review.",
    analyseCta: "Ask the copilot with context",
    analyseQuestion: (deal: string, findings: number) =>
      `Please review the deal "${deal}": the verdict strip shows ${findings} finding(s). Using this customer's interactions and commitments, suggest next steps and risks.`,
  },
  CHAIN_TEXT: {
    forDeal: (deal: string) => `Decision chain · ${deal}`,
    noOpenDealTitle: "No open deal",
    noOpenDealDescription:
      "A buying role only exists relative to a purchase. Once this customer has an open deal, decide there who signs and who can introduce you. The people and their titles are in the roster above.",
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
    commitment_partial: "The follow-up is recorded, but a promise was refused - add it from the commitment list",
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

  ROLE_TEXT: {
    title: "Roles",
    why: "The workspace's own roles: the nine presets can be edited or reset, and new ones created. What a role holds decides what its members can do.",
    coverage: (roles: number, custom: number, perms: number) =>
      `${roles} roles${custom > 0 ? `, ${custom} custom` : ""} · ${perms} permissions`,
    colRole: "Role",
    colSource: "Source",
    colLine: "Line",
    colRank: "Rank",
    lineField: "Business line",
    rankField: "Rank",
    groupUnset: "Choose",
    ungrouped: "Ungrouped",
    groupsButton: "Group settings",
    groupConfigure: "Configure",
    colDescription: "Description",
    colPerms: "Permissions",
    colMembers: "Members",
    preset: "Preset",
    custom: "Custom",
    members: (n: number) => `${n}`,
    noMember: "Nobody holds it",
    noDescription: "No description",
    permCount: (n: number, total: number) => `${n} / ${total}`,
    edit: "Configure role",
    details: "Permission details",
    moveUp: "Move up",
    moveDown: "Move down",
    moveTop: "Move to top",
    moveBottom: "Move to bottom",
    newRole: "New role",
    remove: "Delete role",
    removeWhy: "Only a role nobody holds can be deleted. Remove it from members first.",
    removeTarget: (name: string) => ` "${name}"`,
    removeConsequence: "The role and its permission set are deleted; this cannot be undone.",
    removeHeldHint: (n: number) => `${n} members still hold it; remove it from them first`,
    detailsTitle: (name: string) => `${name} · permissions`,
    detailsWhy: (n: number, total: number) => `Holds ${n} of ${total} permissions. Ticked operations can be performed.`,
    detailsGranted: "Allowed",
    detailsNotGranted: "Not allowed",
    detailsOnlyGranted: "Allowed only",
    detailsAll: "Show all",
    detailsDone: "Close",
    detailsEmpty: "This role holds no permission; a member holding it sees no module.",
    detailsColHeld: "Held",
    detailsEdit: "Edit",
    formTitle: "Configure role",
    formWhy: "A code, a name, one sentence, and the permissions this role holds.",
    code: "Role code",
    codeHint: "Lower-case letters, digits and underscores, starting with a letter, e.g. channel_manager. Fixed once created.",
    codeLocked: "Fixed once created.",
    nameLabel: "Role name",
    descriptionLabel: "Description",
    descriptionHint: "One sentence on what this role does. Shown in the roster and under members.",
    permsConfig: "Permissions",
    pick: "Pick permissions",
    applyPreset: "Apply preset",
    resetPreset: "Apply template",
    clear: "Clear selection",
    applyPresetTitle: "Apply a preset",
    applyPresetWhy: (isNew: boolean): string =>
      isNew
        ? "Pick a preset role; code, name, description and permissions are filled in and can be changed."
        : "Pick a preset role; its name, description and permissions are applied here. The code is the anchor and stays.",
    applyConfirm: "Apply",
    presetOption: (name: string, n: number) => `${name} · ${n} permissions`,
    resetHint: (name: string) => `Restore name, description and permissions from preset "${name}"`,
    resetNone: "No preset matches this code",
    destructiveTitle: "{verb}{target}?",
    resetTarget: (name: string) => ` to preset "${name}"`,
    resetConsequence: (n: number) => `The current name, description and the ${n} selected permissions are overwritten; Discard undoes it until saved.`,
    clearTarget: (n: number) => ` the ${n} selected permissions`,
    clearConsequence: "The list empties and has to be picked again; Discard undoes it until saved.",
    cancel: "Cancel",
    includes: "Permissions held",
    pickEmpty: "No permission selected",
    pickEmptyWhy: "Use Pick permissions on the left, or apply a preset.",
    colIndex: "#",
    colCode: "Code",
    colName: "What it allows",
    colUnlocks: "Operations",
    colOps: "Actions",
    removePerm: "Remove",
    unlocks: (n: number) => `${n}`,
    pickTitle: "Pick permissions",
    pickWhy: "Tick by module. The number after each permission is how many operations it unlocks.",
    pickDone: "Done",
    pickClear: "Clear",
    search: "Search by code or description",
    pickNone: "No matching permission",
    chosen: (n: number) => `${n} permissions selected`,
    save: "Save role",
    discard: "Discard",
    saveFailed: "Save failed",
    resetAllButton: "Apply template",
    resetAllTitle: "Apply the role template",
    resetAllWhy: "Restore the nine preset roles to the shipped configuration. Custom roles are not touched.",
    resetAllDangerTitle: "This overwrite cannot be undone",
    resetAllWarn: (changed: number, missing: number) =>
      changed + missing === 0
        ? "The presets already match the shipped configuration; resetting changes nothing."
        : `${changed > 0 ? `${changed} preset roles were edited and will be overwritten` : ""}${changed > 0 && missing > 0 ? "; " : ""}${missing > 0 ? `${missing} deleted presets will be restored` : ""}. Members holding them get the restored permissions.`,
    resetAllConfirm: "Confirm reset",
    resetAllVerb: "Reset",
    resetAllTarget: " the nine preset roles",
    resetAllConsequence: (changed: number, missing: number) =>
      `${changed} edited presets are overwritten and ${missing} deleted ones restored; it takes effect at once and cannot be undone.`,
    resetDone: (restored: number) => `${restored} preset roles restored`,
    emptyTitle: "No roles yet",
    emptyWhy: "The presets have not been generated for this workspace. Create one, or apply the template.",
  },
  ROW_OPS: {
    details: (noun: string) => `${noun} details`,
    configure: (noun: string) => `Configure ${noun}`,
    up: "Move up",
    down: "Move down",
    top: "Move to top",
    bottom: "Move to bottom",
    remove: (noun: string) => `Delete ${noun}`,
  },
  ROLE_GROUP_TEXT: {
    pageTitle: "Group settings",
    pageWhy: "Roles are placed by business line and rank. The shipped ones can be renamed and re-ordered, new ones added; a group with roles in it cannot be deleted.",
    count: (lines: number, ranks: number) => `${lines} lines · ${ranks} ranks`,
    edit: "Edit",
    save: "Save",
    codeHint: "Lower-case letters, digits and underscores, starting with a letter. Fixed once created; an existing code renames.",
    opUp: "Move up",
    opDown: "Move down",
    opDelete: "Delete",
    colRoles: "Roles",
    line: {
      title: "Business lines",
      why: "The line a role serves: sales, channel, delivery, presales, marketing, operations, customers, and the group layer.",
      add: "New line",
      code: "Line code",
      name: "Line name",
      colName: "Line",
      deleteConsequence: "The line is removed from the groups. It cannot go while roles stand in it.",
    },
    rank: {
      title: "Ranks",
      why: "The rung a role stands on: staff, manager, senior manager, director, general manager, executive.",
      add: "New rank",
      code: "Rank code",
      name: "Rank name",
      colName: "Rank",
      deleteConsequence: "The rank is removed from the groups. It cannot go while roles stand on it.",
    },
  },
  ORG_TEXT: {
    title: "Organization",
    why: "How the company is laid out: headquarters, regions, teams; who belongs to which unit and who leads it. Three shipped templates to start from, then edit freely.",
    count: (units: number, placed: number) => `${units} units · ${placed} placed`,
    noun: "unit",
    newUnit: "New unit",
    kindsButton: "Hierarchy settings",
    thirdParty: "Third-party access",
    thirdPartyHint: "Coming soon",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    childCount: (n: number) => `${n} below`,
    toolbarCount: (n: number) => `${n} units`,
    colUnit: "Unit",
    colTier: "Tier",
    colChildren: "Units below",
    colKind: "Kind",
    colLeader: "Leader",
    colMembers: "Members",
    kindNone: "No kind",
    leaderNone: "Not set",
    noMember: "No members",
    members: (n: number) => `${n}`,
    optionIndent: (depth: number, name: string) => `${"\u00a0\u00a0".repeat(depth)}${depth > 0 ? "- " : ""}${name}`,
    detailsTitle: (name: string) => `${name} · unit details`,
    detailsWhy: (kind: string, leader: string) => `${kind} · leader ${leader}`,
    detailsMembers: (n: number) => `Members · ${n}`,
    detailsNoMembers: "Nobody is placed in this unit yet. Set a member's unit on the Members page.",
    detailsChildren: (n: number) => `Units below · ${n}`,
    detailsNoChildren: "No units below.",
    detailsDone: "Close",
    detailsEdit: "Edit unit",
    remove: "Delete unit",
    removeTarget: (name: string) => `"${name}"`,
    removeConsequence: (members: number) =>
      members > 0 ? `${members} members become unplaced. This cannot be undone.` : "The unit is deleted. This cannot be undone.",
    removeChildrenHint: (n: number) => `${n} units still stand below it; delete them first`,
    removeDone: (unplaced: number) => `${unplaced} members are now unplaced`,
    destructiveTitle: "{verb} {target}?",
    cancel: "Cancel",
    formTitle: "Unit settings",
    formWhy: "Parent, kind, code, name and leader.",
    parentField: "Parent unit",
    parentNone: "None (top level)",
    parentHint: "Not itself, and nothing below it.",
    kindField: "Unit kind",
    kindUnset: "Choose",
    kindConfigure: "Configure",
    code: "Unit code",
    codeHint: "Lower-case letters, digits and underscores, starting with a letter, e.g. south_team1. Cannot be changed once created.",
    codeLocked: "Cannot be changed once created.",
    nameLabel: "Unit name",
    leaderField: "Leader",
    leaderHint: "One of the members; can be left unset.",
    save: "Save unit",
    discard: "Discard",
    saveFailed: "Save failed",
    templateReset: "Apply template",
    templateTitle: "Apply template",
    templateWhy: "Pick a shipped organization template as the starting point, then edit freely - and optionally apply the matching territory setup at the same time.",
    templateOption: (name: string, units: number) => `${name} · ${units} units`,
    templateDefault: "Default",
    templateDangerTitle: "This replacement cannot be undone",
    templateWarn: (units: number, placed: number, divisionName: string | null, currentDivisions: number) => {
      const org = units === 0
        ? "There are no units yet; the template is applied as is."
        : `All ${units} current units are deleted; ${placed} members lose their unit and need placing again.`;
      if (!divisionName) return org;
      const division = currentDivisions === 0
        ? ` The "${divisionName}" territory template is applied at the same time.`
        : ` The current ${currentDivisions} regions are also replaced with "${divisionName}".`;
      return `${org}${division}`;
    },
    templateConfirm: "Confirm replace",
    templateVerb: "Replace",
    templateTarget: (name: string, divisionName: string | null) => divisionName ? `with "${name}" + "${divisionName}"` : `with "${name}"`,
    templateDone: (
      units: number,
      unplaced: number,
      detached: number,
      divisions: number,
      territories: number,
      linkedUnits: number,
      territoriesRetired: number,
    ) => {
      const org = `Template applied: ${units} units; ${unplaced} members to place again${detached > 0 ? `; ${detached} territories detached` : ""}`;
      if (divisions === 0) return org;
      return `${org}; ${divisions} regions and ${territories} territories set up${linkedUnits > 0 ? `, ${linkedUnits} units auto-linked` : ""}${territoriesRetired > 0 ? `, ${territoriesRetired} stale territories retired` : ""}`;
    },
    templateOrgLabel: "Organization template",
    templateDivisionLabel: "Territory setup template",
    templateDivisionWhy: "Optionally apply a shipped region carve at the same time; leave it as-is otherwise.",
    templateDivisionUnavailable: "The small-team template has no region layer, so a territory sync is not available with it.",
    templateDivisionNone: "Leave as-is",
    templateDivisionOption: (name: string, divisions: number) => `${name} · ${divisions} regions`,
    templateAssociateLabel: "Auto-link",
    templateAutoAssociate: "Auto-link units to the new territories by name",
    templateAutoAssociateHint: "Links when a unit's name contains the territory's name, e.g. a \"North Region Team\" unit links to a \"North\" territory.",
    templateAutoAssociateDisabled: "Pick a territory setup template above first - there is nothing new to link to otherwise.",
    colTerritories: "Territories",
    noTerritory: "None",
    fullTerritory: "Full scope",
    fullTerritoryHint: "This unit's subtree covers every territory.",
    aggregateTerritory: "Aggregated",
    inheritedTerritory: "Inherited",
    inheritedTerritoryHint: (ancestorName: string) => `This unit has no territory of its own - it inherits "${ancestorName}"'s scope.`,
    detailsTerritories: (n: number) => `Territories · ${n}`,
    detailsNoTerritories: "No territory is worked by this unit yet. Tick the unit on a territory's form.",
    territoryCovers: (regions: string) => `covers ${regions}`,
    territoryCoversNone: "covers no region",
    removeDetached: (n: number) => `${n} territories detached`,
    emptyTitle: "No units yet",
    emptyWhy: "Create one, or apply a template.",
    moveTo: "Move to…",
    moveTitle: (name: string) => `Move - ${name}`,
    moveWhy: "Pick a new parent unit; not itself, and nothing below it.",
    moveField: "New parent unit",
    moveConfirm: "Move",
    moveDone: (name: string) => `Moved "${name}"`,
    selectionNoun: "units",
    clearSelection: "Clear",
    bulkRemove: "Delete",
    bulkRemoveTarget: (n: number) => `the ${n} selected units`,
    bulkRemoveConsequence: "The selected units are deleted and their members become unplaced; any that still have units below them are skipped. This cannot be undone.",
    bulkRemoveDone: (removed: number, unplaced: number) =>
      `${removed} units deleted${unplaced > 0 ? `; ${unplaced} members are now unplaced` : ""}`,
    bulkRemoveSkipped: (n: number) => `${n} still have units below them and were not deleted`,
  },
  ORG_KIND_TEXT: {
    title: "Hierarchy settings",
    why: "What kinds of unit the organization has: headquarters, division, region, branch, team. Rename, reorder, add; a kind in use cannot be deleted.",
    count: (n: number) => `${n} kinds`,
    noun: "kind",
    add: "New kind",
    save: "Save",
    codeHint: "Lower-case letters, digits and underscores, starting with a letter. Cannot be changed once created; an existing code renames.",
    codeLabel: "Kind code",
    nameLabel: "Kind name",
    colName: "Kind",
    colUnits: "Units",
    deleteConsequence: "The kind is deleted. It cannot go while units are of it.",
  },
  ORG_ERROR: {
    ...GATE_ERROR,
    code_required: "A code is required",
    code_shape: "A code is lower-case letters, digits and underscores, starting with a letter",
    name_required: "A name is required",
    kind_unknown: "Choose a unit kind; add one under Unit kinds if none fits",
    parent_not_found: "The parent unit does not exist; it may have just been deleted",
    parent_cycle: "The parent cannot be the unit itself or anything below it",
    unit_has_children: "Units still stand below it; delete them first",
    unit_unknown: "That unit is not in this workspace",
    template_unknown: "That template does not exist",
    kind_in_use: "Units of this kind still exist; change their kind first",
    move_at_edge: "Already at that end",
    not_movable: "This row cannot be moved",
    not_found: "That unit does not exist; it may have just been deleted",
  },
  ROLE_GROUP_ERROR: {
    ...GATE_ERROR,
    code_required: "A code is required",
    code_shape: "A code is lower-case letters, digits and underscores, starting with a letter",
    name_required: "A name is required",
    line_in_use: "Roles still stand in this line; move them first",
    rank_in_use: "Roles still stand on this rank; move them first",
    move_at_edge: "Already at that end",
    not_movable: "This row cannot be moved",
    not_found: "That group does not exist; it may have just been deleted",
  },
  ROLE_ERROR: {
    ...GATE_ERROR,
    code_required: "A role needs a code",
    code_shape: "A role code is lower-case letters, digits and underscores, starting with a letter",
    name_required: "A role needs a name",
    description_too_long: "A description is at most 500 characters",
    permission_unknown: "That permission is not in the catalogue; pick from the list",
    line_unknown: "Pick a business line; add one under Role groups if none fits",
    rank_unknown: "Pick a rank; add one under Role groups if none fits",
    role_unknown: "That role does not belong to this workspace",
    role_in_use: "Members still hold this role; remove it from them first",
    last_admin: "This is the only administrative role the workspace's administrators hold; removing administration from it would leave nobody able to put it back",
    move_at_edge: "Already at that end",
    not_movable: "This row cannot be moved",
    not_found: "That role does not exist, or does not belong to this workspace",
  },
  TERRITORY_ERROR: {
    ...GATE_ERROR,
    province_unknown: "The province must be one of the 34 provincial-level divisions",
    division_unknown: "That region does not belong to this workspace",
    template_unknown: "No such standard carve, or it does not cut the current market scope",
    scope_not_open: "That market scope is not open yet - stay on China",
    scope_code_required: "A one-province scope has to say which province",
    scope_province_not_open: "That province is not open as a market scope yet",
    member_unknown: "A member has to be part of the current market scope - pick from the list",
    code_prefix: "A region code has to carry the current market scope's prefix",
    code_shape: "A region code is letters, digits and underscores; under a province scope it carries no prefix",
    move_at_edge: "Already at that end",
    not_movable: "This row cannot be moved",
    not_found: "No such region in this workspace",
    code_required: "A territory needs a code",
    name_required: "A territory needs a name",
    unknown_status: "Unknown territory status",
    parent_not_found: "The parent territory does not exist",
    parent_cycle:
      "A territory cannot report to itself, directly or through a chain",
    region_too_long:
      "A region name is at most 64 characters - anything longer is usually the wrong column pasted in",
    unit_unknown: "That unit is not in this workspace",
  },

  EXECUTION_ERROR: {
    ...GATE_ERROR,
    title_required: "An execution needs a title",
    unknown_action_type: "Unknown action type",
    unknown_status: "Unknown execution status",
    campaign_completed:
      "This campaign is complete; its executions are the record it was completed on",
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
    ...GATE_ERROR,
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
    signal_resolved: "This signal has already been judged.",
    unknown_stage: "Unknown funnel stage.",
    outcome_not_of_stage: "That is not how this stage ends.",
    unknown_reason: "Unknown reason for ending.",
    note_required: "'Other' has to say what happened.",
    decider_required: "An exit record names who decided.",
    lead_unowned: "This lead has no owner yet - assign it before qualifying it.",
  },
  PROPOSAL_ERROR: {
    ...GATE_ERROR,
    province_unknown:
      "The province must be one of the 34 provincial-level divisions - pick one from the list",
    industry_unknown:
      "Not one of this workspace's industries - add it under Industries first",
    code_required: "An industry needs a code",
    name_required: "An industry needs a name",
    not_found: "Not found, or not in this workspace.",
    not_pending: "This proposal has already been decided.",
    decider_required: "Accepting must land on a named person.",
    human_decision_required:
      "This proposal needs a person; the current authorisation does not run it unasked.",
    already_decided: "Someone else handled this proposal first.",
    not_executable: "This proposal cannot run from its current state.",
    accepted_without_decider:
      "Nobody signed for this, so it will not be carried out.",
    not_executable_type:
      "Nothing here can carry out that kind of action; marked failed.",
    subject_mismatch:
      "The action and its subject do not agree, so it was not carried out.",
    payload_invalid: "The proposal did not say what to change it to.",
    stage_unchanged:
      "The deal is already at that stage; a no-op is not journalled.",
    reason_required: "Moving a deal back or reopening it requires a reason.",
    terminal_probability_fixed:
      "A closed deal keeps the win rate it closed with.",
    probability_range: "A win rate is a whole number from 0 to 100.",
    closed_requires_terminal_stage:
      "Forecasting as closed requires a closed stage.",
    terminal_requires_closed:
      "Winning or losing a deal must set its close date too.",
    terminal_stage:
      "This deal is closed; reopening rewrites a reported outcome and needs explicit intent.",
    unknown_stage: "The proposal named a stage that does not exist.",
    unknown_forecast_category:
      "The proposal named a forecast category that does not exist.",
    field_not_fillable: "That is not a field the copilot may fill.",
    value_required: "Filling a field needs a value; a blank is not one.",
    nothing_to_ask: "Nothing on this record is a question for the assistant.",
    no_active_tenant:
      "This session carries no tenant, so the model plane cannot be reached.",
    tenant_required:
      "This session carries no tenant, so the model plane cannot be reached.",
    empty_question: "There was nothing to ask.",
    turn_failed:
      "The assistant could not answer this time. Nothing on this record changed.",
  },
  REVIEW_ERROR: {
    reason_not_found: "That reason no longer exists - refresh and choose again",
    reason_in_use: "Reviews cite this reason - it cannot be deleted",
    move_at_edge: "Already at that end",
    not_movable: "That row cannot be moved",
    reason_wrong_outcome: "That reason does not explain this outcome",
    code_required: "A reason needs a code",
    name_required: "A reason needs a name",
    outcome_required: "Pick at least one outcome it explains",

    ...GATE_ERROR,
    not_found: "Not found, or not in this workspace.",
    not_closed: "Only a closed opportunity can be reviewed.",
  },
  LOAD_ERROR: {
    ...GATE_ERROR,
    not_authenticated: "Your session has expired. Please sign in again.",
    permission_denied: "You do not have permission to view this.",
    feature_not_in_tier: "Your plan does not include this capability.",
    unknown: "Could not load the data. Please try again.",
  },
  SEGMENT_ERROR: {
    ...GATE_ERROR,
    segment_code_required: "A segment needs a code.",
    name_required: "A segment needs a name.",
    unknown_status: "That is not a segment status.",
    priority_out_of_range: "Priority is a whole number from 0 to 9999.",
    plan_closed:
      "This plan is closed. Its segmentation is the record of how the market was cut for that period.",
    not_found: "Record not found - the page may be stale, refresh it.",
    status_unchanged: "Already in that state.",
    segment_in_use:
      "Campaigns aim at it or accounts carry its code - retire it instead of deleting.",
    move_at_edge: "Already at that end of the list.",
    not_movable: "This row is not in the list being ordered.",
  },
  PLAN_ERROR: {
    ...GATE_ERROR,
    plan_no_required: "A plan needs a number",
    name_required: "A plan needs a name",
    period_required: "A plan needs a period",
    plan_no_taken: "That number is already taken",
    not_found: "That plan does not exist, or is not in this workspace",
    unknown_status: "Unknown plan status",
    illegal_transition: "A plan cannot move that way from where it is",
    plan_settled:
      "A closed or archived plan is not rewritten - its period is spent, and downstream records were measured against what it said at the time",
  },

  PROJECT_ERROR: {
    ...GATE_ERROR,
    not_found: "That project does not exist, or is not in this workspace",
    name_required: "A project needs a name",
    unknown_status: "Unknown project status",
    // The same sentence LIFECYCLE_ERROR gives this code.
    illegal_transition: "This status cannot move directly to that one",
    sequence_immutable:
      "An instalment's sequence is that row's identity - reordering means writing a new row, not editing this one",
    sequence_invalid: "That is not a valid instalment sequence",
  },
  MILESTONE_ERROR: {
    ...GATE_ERROR,
    name_required: "A milestone needs a name",
    sequence_invalid: "Sequence is a whole number from zero",
    unknown_status: "Unknown milestone status",
    done_needs_completion: "A milestone marked done must say when it was done",
    completion_needs_done:
      "A completion time belongs to a milestone that is done - a missed one did not happen",
    acceptance_needs_done: "A gate the customer signed off is a gate that is done",
    acceptor_required: "Name who signed it off on the customer's side",
    recorder_required: "An acceptance record names who recorded it",
    change_reason_required: "Moving a committed gate needs a reason",
    changer_required: "A change record names who made it",
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
    // incr/0034 - the deal entry gate.
    owner_required: "A deal needs somebody to own it.",
    requirement_required: "A deal has to say what the customer wants.",
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
    not_below_floor:
      "This line is at or above its floor - there is nothing to approve",
    already_approved: "This price has already been signed off",
    not_priced:
      "This product has no price entry, so there is no floor to approve against",
  },

  OPPORTUNITY_TEXT: {
    linesTitle: "Product lines",
    linesPageTitle: (deal: string) => `Lines · ${deal}`,
    linesEdit: "Edit lines",
    linesWhy:
      "When lines exist, the lines are authoritative - the deal amount equals their sum, recomputed by the service in the same call that writes them. A single total cannot say what the money buys.",
    lineProduct: "Product",
    lineQty: "Qty",
    linePrice: "Unit price",
    lineAmount: "Amount",
    lineAdd: "Add a line",
    lineRemove: "Remove",
    lineSave: "Save lines and recompute the amount",
    lineSaved: (n: number, amount: string) =>
      `${n} lines, amount recomputed to ${amount}`,
    lineNone: "No lines yet - the amount is a hand-entered total",
    lineNoneWhy:
      "That is the legal legacy shape: with no lines, the header stands on its own.",
    lineBelowFloor: "Below floor - needs a signature",
    lineFloorHint: (floor: string) => `Floor ${floor}`,
    lineDenied: "You cannot change this deal",
    lineClosedHint:
      "A closed deal cannot be repriced - its lines are the record of what was sold",
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
    termsOpen: "Adjust terms",
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

  FORECAST_PARAM_ERROR: {
    commit_out_of_range: "Commit sits between 1 and 100",
    best_case_out_of_range: "Best case sits between 1 and 100",
    bands_cross: "Best case has to start below commit, or the bands cannot be told apart",
    stall_out_of_range: "A stall clock runs from 1 to 365 days",

    ...GATE_ERROR,
  },

  FORECAST_PARAM_TEXT: {
    title: "Forecast bands",
    why: "What probability counts as commit, as best case, and how long a stall takes.",
    ladder: (best: number, commit: number) => `Best case ${best}% - commit ${commit}%`,
    save: "Save",
    saved: "Saved. The forecast review suggests against the new bands from now on.",
    percent: "%",
    days: "days",
    commitLabel: "Commit starts at",
    commitHint:
      "A deal's own probability at or above this reads as commit. 80 by default: negotiate already defaults to 90, so 90 here would only restate the stage.",
    bestCaseLabel: "Best case starts at",
    bestCaseHint: "At or above this is best case, below it is pipeline. Has to be under commit.",
    stallLabel: "A stall is",
    stallHint:
      "This long at one stage and the suggestion drops a band. Not the same clock as 'nobody has talked to the customer' (30 days).",
  },

  PRICING_ERROR: {
    currency_invalid: "A currency is a three-letter ISO code, like CNY or USD",

    ...GATE_ERROR,
  },

  PRICING_TEXT: {
    title: "Pricing rules",
    why: "What quotes, prices and roll-ups are in unless a row says otherwise.",
    save: "Save",
    saved: "Saved. Deals and lines created from now on take the new currency.",
    currencyLabel: "Default currency",
    currencyHint: "ISO 4217, three letters. Existing prices and deals are untouched; only what is written next.",
  },

  AGEING_ERROR: {
    cutoff_count: "An ageing policy has between one and five cutoffs",
    cutoff_range: "A cutoff is a whole number of days, 1 to 3650",
    cutoffs_unordered: "The cutoffs have to rise, or two bands would claim the same day",

    ...GATE_ERROR,
  },

  AGEING_TEXT: {
    title: "Ageing bands",
    why: "Where an overdue receivable is cut. Not yet due and no due date are always their own.",
    bandCount: (n: number) => `${n} late bands`,
    save: "Save",
    saved: "Saved. The collections chart is cut by the new bands from now on.",
    cutoffsLabel: "Cutoffs (days)",
    cutoffsHint: "Comma separated, ascending. 30, 60 gives 1-30 days, 31-60 days, and 60+.",
    previewLabel: "Which gives these bands",
    previewHint:
      "The two at the ends do not move: one is money that is simply early, the other is money nobody can age at all.",
    previewUnusable: "Ascending whole numbers, please",
  },

  INDUSTRY_ERROR: {
    code_required: "An industry needs a code",
    name_required: "An industry needs a name",
    industry_in_use: "Customers are still filed under this industry - move them first",
    industry_unknown: "Not one of this workspace's industries - add it under Industries first",
    move_at_edge: "Already at that end of the list",
    not_movable: "This one cannot be moved",
    not_found: "No such industry - it may have just been deleted. Refresh and try again",

    ...GATE_ERROR,
  },

  INDUSTRY_TEXT: {
    noun: "industry",
    configTitle: "Industries",
    configWhy: "What customers are filed under. One in use cannot be deleted.",
    count: (n: number) => `${n} industries`,
    add: "New industry",
    edit: "Edit",
    save: "Save",
    code: "Code",
    codeHint: "Fixed once created. An existing code renames it.",
    name: "Name",
    colName: "Industry",
    colFiled: "Customers",
    deleteConsequence: "It leaves the customer form. Customers filed under it are untouched - one in use cannot be deleted.",
    opUp: "Move up",
    opDown: "Move down",
    opDelete: "Delete",
  },

  WINLOSS_TEXT: {
    reasonNoun: "reason",
    reasonConfigTitle: "Win/loss reasons",
    reasonCount: (n: number) => `${n} reasons`,
    reasonConfigWhy: "What a review may choose from. A reason cited by a review cannot be deleted.",
    addReason: "New reason",
    editReason: "Edit",
    saveReason: "Save",
    reasonCode: "Code",
    reasonCodeHint: "Fixed once created. An existing code renames it.",
    reasonName: "Name",
    colReasonName: "Reason",
    colApplies: "Explains",
    colCited: "Cited",
    appliesWon: "Wins",
    appliesLost: "Losses",
    appliesBoth: "Both",
    appliesHint: "Pick at least one. A reason like \"customer did not decide\" explains only losses.",
    reasonDeleteConsequence: "It leaves the review form. Reviews that cite it are untouched - one that is cited cannot be deleted.",
    opUp: "Move up",
    opDown: "Move down",
    opDelete: "Delete",

    tagPending: (n: number) => (n === 0 ? "Nothing awaiting review" : `${n} awaiting review`),
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
    reasonNone: "Not chosen",
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
    planRequired:
      "A strategic account needs a plan, or the tier is just a label",
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

    subscription: (tier: string) => zh.TIER_LABEL[tier] ?? tier,
    subscriptionNone: "No subscription",
    subscriptionAria: "Subscription tier",
    productCode: (code: string) => code,

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
    accountStatus: (status: string | null) =>
      status === null ? "Status unknown" : (LOGIN_ACCOUNT_STATUS_LABEL_EN[status] ?? status),
    accountCentre: "Account centre",
    switchUser: "Switch user",
    logout: "Sign out",
    userMenuOpen: "Open the user menu",
    boardOpen: "Show the board",
    boardClose: "Hide the board",
    agentDock: "Copilot",
    agentDockWithCount: (n: number) => `Copilot, ${n} awaiting your call`,

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
    tagMembers: (n: number) => `${n} members`,
    title: "Configuration",
    description: "How this workspace is configured.",
    emptyTitle: "You hold no administration permission",
    emptyDescription:
      "This is not a subscription tier problem and money will not fix it. An administrator has to assign you a role.",
    planned: "Not built",
    entryHint: {
      members: "Who sits in which unit: territories, data scope and roles",
      roles: "What each of the nine roles is, and what it may do",
      permissions: "How permissions are grouped, and which roles hold them",
      scope: "Workspace / territory / own - who sits at which",
      product: "Product types, statuses and pricing units",
      winLossReason: "What a win/loss review may choose from",
      industry: "How customers are filed by industry - change it once, everywhere follows",
      forecastThreshold: "Where commit and best case start",
      ageingPolicy: "How many days overdue makes a band",
      pricingPolicy: "What currency a quote assumes",
      adoption:
        "Whether follow-up notes are actually being used. Criteria in ADR-012",
      division: "How the country is carved into regions, and which provinces each holds",
      orgUnit: "How headquarters, regions and teams are laid out, and who belongs where",
    },
    memberCount: (members: number, roles: number) =>
      `${members} members - ${roles} roles in use`,
    memberNone: "No members yet - they appear after their first sign-in",
    memberNoRead: "No permission to read members",
    rolesFact: (roles: number, perms: number) => `${roles} roles · ${perms} permissions`,
    divisionCount: (divisions: number, placed: number, total: number, noun: string) =>
      placed === total
        ? `${divisions} regions · all ${total} ${noun} assigned`
        : `${divisions} regions · ${total - placed} ${noun} unassigned`,
    divisionNoRead: "No permission to read regions",
    adoptionCriterion: (weeks: number, judge: number) =>
      `Judged over the last ${weeks} weeks; ${judge} consecutive weeks at target counts as adopted`,
    open: "Open",
  },
  // --- /signal ------------------------------------------------------------

  SCREEN_TEXT: {
    title: "Market situation",
    subtitle: "National Sales Situation Screen",
    deniedTitle: "The situation screen cannot be shown",
    deniedDescription:
      "It aggregates leads, pipeline, contracts, the copilot queue, delivery and collections on one surface, so it needs the view permission for all five of accounts, pipeline, delivery, leads and copilot actions. With any of them missing it shows nothing rather than a partial national figure.",
    home: "Platform home",
    provinceCount: "Provinces",
    openDeals: "Open deals",
    unplacedNote: (n: number) => `${n} accounts have no province - counted nationally, drawn nowhere`,
    nation: "China",
    regionDefault: "All",
    drillHint: "Click a province to drill in - right-click or click empty space to go back",
    backHint: "Right-click / click empty space to go up",
    back: "Back",
    metricContract: "Contract",
    metricPipeline: "Pipeline",
    metricInDelivery: "In delivery",
    metricHealth: "Health",
    funnelAccounts: "Accounts",
    funnelPipeline: "Pipeline",
    funnelContract: "Contract",
    funnelDelivery: "In delivery",
    noReading: "no reading",
    unitYi: "00M",
    unitWan: "K",
    unitYuan: "",
    accountsUnit: (n: number) => `${n}`,
    dealsUnit: (n: number) => `${n}`,
    panelLeads: "Lead supply",
    panelPipeline: "Pipeline",
    panelContract: "Signed contracts",
    panelCopilot: "Copilot",
    panelDelivery: "Delivery",
    panelCollection: "Collections",
    cellLeadsNew: "New leads",
    cellLeadsUnclaimed: "Unclaimed",
    cellLeadConversion: "Conversion",
    cellPipelineValue: "Pipeline value",
    cellOpenDeals: "Open deals",
    cellAvgDeal: "Avg deal",
    cellContractValue: "Contract value",
    cellWonDeals: "Deals won",
    cellWinRate: "Win rate",
    cellAdoption: "Proposal adoption",
    cellAdoptionSub: (a: number, n: number) => `${a} / ${n} accepted, last 30 days`,
    cellPending: "Awaiting a decision",
    cellInDelivery: "Contract value in delivery",
    cellProjectsLive: "Live projects",
    cellHealth: "Health",
    cellCollected: "Collected",
    cellReceivable: "Receivable",
    cellOverdue: "Overdue",
    cellWeighted: "Weighted",
    cellOnTime: "Gates on time",
    cellInfluenced: "Value touched",
    qualExpected: "expected",
    qualLate: "late",
    adoptionSuffix: "accepted, last 30 days",
    chartLeads: "New leads, last 12 periods",
    chartSign: "Signed value, last 12 periods",
    chartAdoption: "Adoption, last 30 days",
    chartCash: "Collection rate, last 7 periods",
    cashCollected: (p: string) => `Collected ${p}`,
    cashOverdue: (p: string) => `Overdue ${p}`,
    stageLabels: ["Discover", "Validate", "Negotiate", "Approve"],
    healthLabels: ["Healthy", "At risk", "Critical"],
    healthCentre: "Healthy",
    funnelLeads: "Leads",
    funnelCollected: "Collected",
    leadsUnit: "",
    enterFullscreen: "Full screen",
    exitFullscreen: "Leave full screen",
    switchLocale: (to: string): string => (to === "en-US" ? "Switch to English" : "Switch to Chinese"),
    settingsSoon: "Settings (not yet available)",
    periodResolving: "Reading the clock…",
    periodAll: "All time",
    periodYear: (y: number) => `${y}`,
    periodQuarter: (y: number, q: number) => `${y} Q${q}`,
    emptyPeriod: (p: string): string => `Nothing recorded in ${p} - try another period`,
    enter: "Open",
    uncovered: "No activity",
    viewerRole: "Sales ops - national",
    foldTitle: "Collapse the title",
    unfoldTitle: "Expand the title",
    foldRails: "Fold both rails",
    unfoldRails: "Unfold both rails",
  },

  TABLE_TOOLBAR_TEXT: {
    searchLabel: "Search",
    resetFilters: "Clear filters",
    filteredCount: (n: number, total: number) => `${n} / ${total}`,
    noMatch: "No matching records",
    noMatchWhy: "Try a different keyword, or loosen the filters.",
  },

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

    // Counts of what this page holds - see the zh catalogue.
    dismissWhy: "Record why. Otherwise the same signal arrives next week and nobody can tell whether it was looked at and rejected or never looked at.",
    dismissReason: "Reason",
    dismissReasonPick: "Pick a reason",
    dismissNote: "Note",
    dismissNoteRequired: "Required when the reason is Other",
    dismissNoteOptional: "Optional",
    scoutTitle: "What the scout noticed",
    scoutQuiet: "Nothing to raise: no repeats, no exact customer matches, nobody clustering.",
    scoutDuplicate: (n: number) =>
      n === 0 ? "Another signal of the same kind the same day - one event reported twice" : `Another signal of the same kind ${n}d earlier - one event reported twice`,
    scoutMatch: (account: string) => `This names ${account}, a customer already on file`,
    scoutMatchAccept: "Match to this customer",
    scoutClusters: "Companies clustering",
    scoutCluster: (subject: string, n: number, kinds: number) =>
      `${subject}: ${n} open signals across ${kinds} kinds - one story, not ${n} things`,
    tagSignals: (n: number) => `${n} to judge`,
    tagNamed: (n: number) => `${n} named-account`,
    tagStale: (n: number) => `${n} decayed`,
    tagLeads: (n: number) => `${n} leads`,
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
  EXIT_REASON_LABEL: {
    duplicate: "Duplicate record",
    not_a_fit: "Not a fit",
    no_budget: "No budget",
    no_decision: "Never decided",
    lost_to_competitor: "Lost to a competitor",
    timing: "Wrong timing",
    customer_withdrew: "Customer cancelled the project",
    unreachable: "Unreachable",
    other: "Other",
  } as Record<string, string>,
  FUNNEL_TEXT: {
    title: "The whole funnel",
    why: "Every number counts rows the modules already show. \"No reason recorded\" has two causes: deals, projects and cash have no surface that asks yet, and rows that ended before signals and leads got one never recorded it.",
    moduleWhy: "Signal to lead to deal to project to cash. The one page about the whole chain - every other module is about one link in it.",
    stage: {
      signal: "Signals",
      lead: "Leads",
      opportunity: "Deals",
      project: "Projects",
      revenue: "Cash",
    } as Record<string, string>,
    part: {
      advanced: "moved on",
      open: "in hand",
      exited: "ended",
    } as Record<string, string>,
    passed: (pct: number, reached: number) => `${pct}% moved on of ${reached} reached`,
    nothingReached: "Nothing has reached this stage",
    byStage: "Stage by stage",
    unexplained: (n: number) => `${n} ended with no reason recorded`,
    blind: (stages: string) => `Not visible to you: ${stages}. Those stages report nothing rather than zero.`,
    listSeparator: ", ",
    tagEntered: (n: number) => `${n} entered`,
    tagLive: (n: number) => `${n} in hand`,
    tagLeak: (stage: string, n: number) => `${stage} leaks most: ${n}`,
  },

  LEAD_TEXT: {
    title: "Leads",
    moduleWhy:
      "Signals become leads; a qualified lead becomes an opportunity. Suggested assignments propose who should work each one by territory then load; a lead nobody owns cannot be qualified.",
    addLead: "Add lead",
    addLeadWhy: "Leads from a stand, a phone call or a referral - the ones no signal produced. Saved into the pool; who works it is Suggested assignments' question.",
    formContact: "Contact",
    formNoAccount: "Not matched yet",
    formAccountWhy: "Without a customer there is no region, so neither assignment nor conversion can run. It can be matched later from the row.",
    formOwnerNote: "No owner and no score here: who works it comes from Suggested assignments by territory then load, and a score is the signal rule's arithmetic - a hand-entered lead has no signal.",
    formSave: "Save lead",

    searchLabel: "Search",
    resetFilters: "Clear filters",
    searchHint: "company, lead no., contact, owner",
    filterAllStatus: "All statuses",
    filterAllOwners: "All owners",
    filterUnowned: "Unowned",
    filteredCount: (n: number, total: number) => `${n} of ${total}`,
    noMatch: "No leads match",
    noMatchWhy: "Try another term, or widen the filters.",
    startWork: "Start working",
    convertWhy: (company: string) => `Turn ${company} into a deal. The source campaign is copied onto it at this moment and frozen - it cannot be corrected afterwards.`,
    convertRequirement: "What the customer wants",
    convertRequirementHint: "the problem they need solved",
    convertRequirementWhy: "A deal has to say what it is for - it is how somebody who was not in the meeting judges whether to spend time on it. Editable later.",

    terminate: "Close as lost",
    terminateConsequence: "The lead was real and the opportunity is gone. The record is kept and stays in the funnel's denominator - the reason is recorded so the leak can be read by stage later.",
    hintTerminateWhy: "It was real and it died - a different thing from not a fit",
    exemptAsksReason: "This action asks for a reason first, which is a stronger gate than a confirm box",
    endSubmit: "End the lead",
    endReason: "Reason",
    endReasonPick: "Pick a reason",
    endNote: "Note",
    endNoteRequired: "Required when the reason is Other",
    endNoteOptional: "Optional",

    hintAlreadyWorking: "Already being worked, or already judged",
    claim: "Claim",
    assign: "Assign",
    handOver: "Hand over",
    matchAccount: "Match a customer",
    matchWhy: (company: string) => `Link ${company} to a customer record. Without one there is no region, so neither assignment nor conversion can run.`,
    matchSubmit: "Match",
    matchPick: "Pick a customer",
    columnAccount: "Customer",
    openAccount: "Open customer record",
    remove: "Delete lead",
    removeConsequence: "Deletion cannot be undone, and the lead leaves every funnel count. If it was a real opportunity that went nowhere, disqualify it instead - that keeps the record.",
    hintAlreadyOwned: "It already has an owner - use Hand over to change it",
    hintAlreadyMatched: "Already matched to a customer",
    hintAssignOpensPanel: "Opens Suggested assignments, by territory then load",
    hintConvertedKept: "A converted lead is the only record of where its deal came from",
    bulkRefused: (n: number) => `${n} could not be deleted`,

    deleteSelected: (n: number) => `Delete ${n}`,
    columnRegion: "Region",
    noRegion: "no region",
    tagOpen: (n: number) => `${n} in play`,
    tagQualified: (n: number) => `${n} qualified`,
    tagUnowned: (n: number) => `${n} unowned`,
    tagConverted: (n: number) => `${n} converted`,
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
    hintNoOwner: "No owner yet - claim it or use Suggested assignments first",
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
    tagOpen: (n: number) => `${n} open`,
    tagNoDate: (n: number) => `${n} with no close date`,
    tagUnowned: (n: number) => `${n} unowned`,
    buyerUnreachable: "buyer unreached",
    title: "Pipeline",
    descriptionReadOnly:
      "Read-only: you can see the pipeline but hold no permission to move a deal.",
    description:
      "Forecast and snapshot are computed by the same rule, so they cannot disagree.",
    columnOpportunity: "Opportunity",
    columnAccount: "Account",
    columnStageForecast: "Stage / forecast",
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
    scopeLabel: "Snapshot scope",
    scopeWorkspace: "Whole workspace",
    scopeTerritory: (name: string) => `Territory - ${name}`,
    scopeOwner: (sub: string) => `Owner - ${sub}`,
    accuracySettled: (r: number) => `${Math.round(r * 100)}% accurate`,
    accuracySoFar: (r: number) =>
      `${Math.round(r * 100)}% of the opening commit closed`,
    accuracyNoOpening: "No opening snapshot - accuracy cannot be computed",
    accuracyNoCommit: "Nothing was committed - nothing to measure against",
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
    newRequirement: "What the customer wants",
    newRequirementHint: "the problem they need solved",
    newRequirementWhy: "It is how somebody who was not in the meeting judges whether to spend time on this. Editable later.",
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
    tagTotal: (n: number) => `${n} customers`,
    tagAtRisk: (n: number) => `${n} at risk`,
    tagOverdue: (n: number) => `${n} overdue for contact`,
    tagCompletable: (n: number) => `${n} with fillable gaps`,
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
    columnIndustrySegment: "Industry / segment",
    columnOwner: "Owner",
    columnHealthStatus: "Health / status",
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
    rosterOpenProjects: "Go to project delivery",
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
    batchCompleteBanner: (n: number) =>
      `${n} customer records the data can complete - batch it`,
    batchCompleteLink: "Go",
    contactsTitle: "Contacts",
    contactsWhy:
      "The people inside this customer and what each is to the deal. The chain above and the board's decision-maker coverage are both computed from these roles.",
    contactsNone: "No contacts yet",
    contactsNoneWhy:
      "Write down who you have met - the decision chain has nothing to compute until then.",
    contactName: "Name",
    contactTitle: "Title",
    contactDepartment: "Department",
    contactRole: "Decision role",
    contactInfluence: "Influence 0-100",
    contactFormTitle: (name: string) => `Contacts · ${name}`,
    contactFormWhy:
      "Who this person is, which department, how to reach them. What they are on a given deal is decided on that deal's page.",
    contactMobile: "Mobile",
    contactEmail: "Email",
    contactWechat: "WeChat",
    contactStatus: "Status",
    contactStatusLabel: {
      active: "Active",
      left: "Left",
      invalid: "Invalid",
    } as Record<string, string>,
    contactEditing: "Editing",
    contactNew: "New contact",
    contactSave: "Save contact",
    contactSaved: "Saved",
    contactsDenied: "You cannot maintain contacts",
    ownerNone: "Unassigned",
    contactCount: (n: number) => `${n} contacts`,
  },

  ACCOUNT_STATUS_LABEL: {
    prospect: "Prospect",
    active: "Active",
    dormant: "Dormant",
    churned: "Churned",
  },

  // --- /campaign ----------------------------------------------------------

  CAMPAIGN_TEXT: {
    tagCount: (n: number) => `${n} campaigns`,
    tagSpend: (budget: string, won: string) => `${budget} spent, ${won} won`,
    executionsTitle: "Campaign executions",
    executionsWhy:
      'What a campaign is actually made of. The "N/M done" column above counts these - and a campaign cannot be marked complete while any is outstanding.',
    executionsNone: "No executions yet",
    executionsNoneWhy:
      "List the actions first - a campaign cannot be run or closed without them.",
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
    settleAsk:
      "How much actually arrived? Short payment is normal - the received amount is the point",
    moveTo: "Move to",
    moved: (s: string) => `Moved to ${s}`,
    milestonesTitle: "Delivery plan",
    milestonesWhy:
      "The milestones a project is delivered against. They were always read and never rendered, and never writable - so a delivery plan could only be whatever db-init put there.",
    milestonesNone: "No milestones yet",
    milestonesNoneWhy:
      "Lay out the steps - the health verdict in the table above reads them.",
    milestoneProject: "Project",
    milestonePickProject: "Pick a project",
    milestoneSequence: "Sequence",
    milestoneName: "Milestone",
    milestoneDue: "Due",
    milestoneCompleted: "Completed",
    newMilestoneEntry: "New milestone",
    milestoneNoDate: "Not scheduled",
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
    milestoneSlippedLate: (n: number) => `${n}d later than committed`,
    milestoneSlippedEarly: (n: number) => `${n}d earlier than committed`,
    milestoneAcceptedByName: (who: string) => `Accepted by ${who}`,
    milestoneChanged: (n: number) => (n === 1 ? "moved once" : `moved ${n} times`),
    milestoneAwaitingAcceptance: "Awaiting customer sign-off",
    milestoneAcceptedBy: "Signed off by (customer)",
    milestoneAcceptedByHint: "who signed on the customer's side",
    milestoneAcceptedAt: "Acceptance date",
    milestoneChangeReason: "Reason for the change",
    milestoneChangeReasonHint: "why this gate is moving",
    milestoneChangeWhy:
      "This gate was committed to and has money bound to it. Moving it writes an append-only change record; the committed date itself is not rewritten.",
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
    title: "Project delivery",
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
    columnNameAccount: "Project / account",
    columnManager: "Manager",
    columnHealthStatus: "Health / status",
    columnContract: "Contract",
    healthOverridden: "Downgraded",
    healthOverriddenWhy:
      "Delivery reported healthy. The rule does not accept it: a project with unpaid overdue instalments may not show as healthy.",
    healthOverriddenEvidence: "Basis",
    emptyTitle: "No delivery projects yet",
    emptyDescription:
      "A won opportunity becomes a delivery project and appears here.",

    instalmentSeq: (n: number) => `Instalment ${n}`,
    rosterOpen: "Still owed",
    rosterOpenWhy:
      "Money promised and not yet arrived. A due date that has passed while the status has not caught up is the one this table exists to show.",
    rosterClosed: "Closed",
    rosterClosedWhy:
      "Settled and written off both stay here. Money that arrived did arrive; a write-off is reversed by a new schedule, not by editing this row.",
    settleShort: "Record",
    colDueStatus: "Due / status",
    noDueDate: "No due date",
    overdueBy: (n: number) => `${n} days overdue`,
    dueIn: (n: number) => `${n} days to go`,
    settleTitle: "Record a payment",
    settleAmount: "Amount received",
    settleConfirm: "Mark settled",
    tagCollectDue: (n: number) => `${n} outstanding`,
    tagCollectOverdue: (n: number) => `${n} overdue`,
    tagCollectShort: (n: number) => `${n} short-paid`,
    collectStatCount: (n: number) => `${n} instalments`,

    overviewTitle: "Collections analysis",
    overviewWhy:
      "The shape first: which ageing band the money sits in, and who most of it is with. The schedule below is the line-by-line detail.",
    overviewEmpty: "Nothing is outstanding, so there is nothing to plot.",
    collectedRate: "Collected",
    collectedOf: (got: string, promised: string) => `${got} in of ${promised} promised`,
    ageingTitle: "Ageing",
    ageingWhy:
      "By days past due. Not-yet-due is the healthy band and it stays, so the tail can be read as the exception or the rule.",
    byProjectTitle: "Concentration",
    byProjectWhy: "The eight projects holding the most outstanding money.",
    ageingBand: {
      not_due: "Not yet due",
      no_due_date: "No due date",
    } as Record<string, string>,
    ageingBetween: (from: number, to: number) => `${from}-${to} days late`,
    ageingOver: (days: number) => `${days}+ days late`,
    collectStatEmpty: "Nothing is outstanding, so there is nothing to break down.",

    collectAdviceTitle: "Collections check",
    collectAdviceClear: "Nothing on these collections needs attention.",
    collectAdviceOpenDelivery: "See delivery",
    collectAdviceFlag: "Mark overdue",
    collectAdviceFlagged: "Marked overdue",
    collectAdviceOverdue: (name: string, days: number) =>
      `"${name}" has an instalment ${days} days overdue.`,
    collectAdviceDueNotFlagged: (name: string, days: number) =>
      `"${name}" has an instalment ${days} days past its due date and the status has not caught up.`,
    collectAdviceShort: (name: string, gap: string) =>
      `"${name}" was paid ${gap} short and nobody is chasing the difference.`,
    collectAdviceNoDueDate: (name: string) =>
      `"${name}" has an instalment with no due date, so it will never show up as overdue.`,
    collectAdviceNothing: (name: string) => `"${name}" has collected nothing at all yet.`,
    rosterRunning: "In flight",
    rosterRunningWhy:
      "Planning, active and paused projects. The health shown is the one the facts derive; when the delivery team reported something rosier, the row says so.",
    rosterFinished: "Closed out",
    rosterFinishedWhy:
      "Delivered, closed and cancelled projects stay here. They have no plan left to be late against and no health left to correct.",
    columnProgress: "Progress",
    progressNoPlan: "No plan set",
    progressPlanDone: "Plan complete",
    progressPlanOpen: "Milestones left open",
    noProjects: "No delivery projects yet",
    reportedAs: (h: string) => `reported ${h}`,
    reconciledChanged: "Health recomputed from the facts",
    reconciledSame: "Report and facts already agree",
    tagDeliveryRunning: (n: number) => `${n} in flight`,
    tagDeliveryDowngraded: (n: number) => `${n} reported rosier`,
    tagDeliveryRed: (n: number) => `${n} at high risk`,
    deliveryStatCount: (n: number) => `${n} projects`,
    deliveryStatEmpty: "Nothing is in flight, so there is nothing to break down.",

    analysisTitle: "Delivery analysis",
    analysisWhy:
      "The shape first: which stage the work sits at, where the risk is, and whose contracts carry the value. The list below is the detail.",
    chartPeak: "Peak",
    analysisEmpty: "Nothing is in flight, so there is nothing to plot.",
    downgradeScope: (n: number, total: number) => `${n}/${total} reported rosier`,
    downgradeRate: "Reported rosier than the facts",
    downgradeOf: (n: number, total: number) => `${n} of ${total} in flight`,
    downgradeWhy:
      '"We are fine" standing next to "they have not paid" is the most common way a failing engagement stays green until it is a crisis.',
    byStageTitle: "By stage",
    byStageWhy: "Contract value at each project status, in the order work moves through them.",
    byHealthTitle: "By health",
    byHealthWhy:
      "The derived health, live work only. A delivered project's health is history, not a reading of what is running.",
    byProjectTitleDelivery: "Concentration",
    byProjectWhyDelivery: "The eight in-flight projects carrying the most contract value.",
    contractTotal: (amount: string, currency: string) => `${amount} ${currency} contracted`,

    adviceTitle: "Delivery check",
    adviceClear: "Nothing on these projects needs attention.",
    adviceOpenCollection: "See collections",
    adviceDowngraded: (name: string) =>
      `"${name}" reports better health than the facts support - recompute first, then decide whether to have the conversation.`,
    adviceMilestoneLate: (name: string, n: number) =>
      `"${name}" has ${n} milestones past their date and not done.`,
    adviceNoManager: (name: string) => `"${name}" is in flight with nobody assigned to it.`,
    adviceNoMilestones: (name: string) =>
      `"${name}" is in flight with no milestones at all - no plan means nothing to be late against.`,
    adviceNoContract: (name: string) =>
      `"${name}" is in flight with no contract amount, so delivery has nothing to be measured against.`,
    searchHint: "Project, number, customer",
    filterAllHealth: "All health",
    narrowedNote: "Narrowed by the search above",
    instalmentCount: (n: number) => `${n} instalments`,
    collectionSearchHint: "Project",
    filterAllRevenueStatus: "All collection states",
  },

  HEALTH_LABEL: {
    green: "Healthy",
    amber: "At risk",
    red: "In trouble",
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
    ...GATE_ERROR,
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
    captureTitle: (name: string) => `Record a touch · ${name}`,
    captureCrumb: "Record a touch",
    captureWhy:
      "Dump what happened verbatim; add who promised what below - each promise remembers the conversation it came from.",
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
    tagPeriod: (period: string) => `${period}`,
    tagScopes: (n: number) => `${n} scopes`,
    tagUnforecast: (n: number) => `${n} unforecast`,
    tagTerritories: (n: number) => `${n} territories`,
    tagNoOwner: (n: number) => `${n} with no owner`,
    setTarget: "Set a target",
    setTargetWhy:
      "A target's scope tuple is its identity: one target per period, scope and metric. To change the number, adjust the one that exists rather than adding a second.",
    setScope: "Scope",
    scopeTerritory: "Territory",
    scopeOwner: "Me",
    setMetric: "Metric",
    // The noun follows the market scope: provinces nationwide, cities in one
    // province. English carries it in the plural.
    memberNoun: {
      global: "countries",
      china: "provinces",
      province: "cities",
    } as Record<string, string>,
    unitNoun: {
      city: "cities",
      district: "districts",
    } as Record<string, string>,
    divisionName: "Region",
    divisionMemberCount: (noun: string) => noun.charAt(0).toUpperCase() + noun.slice(1),
    divisionScope: (_noun: string) => "Covers",
    divisionFormTitle: "Configure a region",
    divisionFormWhy: (noun: string) => `Choose the ${noun} this region covers. Each belongs to one region.`,
    divisionCode: "Region code",
    divisionCodeHint: "Fixed once created - it is this region's anchor. An existing code renames it.",
    divisionNameLabel: "Region name",
    divisionMembersConfig: "Coverage",
    divisionPickMembers: "Choose members",
    divisionApplyPreset: "Apply a preset",
    divisionResetPreset: "Apply template",
    divisionClearMembers: "Clear",
    divisionApplyPresetTitle: "Apply a preset",
    divisionApplyPresetWhy: (isNew: boolean): string =>
      isNew
        ? "Pick a standard region; its code, name and members are filled in - still editable."
        : "Pick a standard region; its name and members are applied here. The code is the anchor and stays.",
    divisionApplyConfirm: "Apply",
    divisionResetPresetHint: (from: string, name: string) => `Restore name and members from ${from} - ${name}`,
    destructiveTitle: "{verb} {target}?",
    divisionResetTarget: (from: string, name: string) => `to ${from} - ${name}`,
    divisionResetConsequence: (n: number, noun: string) =>
      `The current name and the ${n} ${noun} chosen are replaced by the preset; Discard undoes it until you save.`,
    divisionClearTarget: (n: number, noun: string) => `the ${n} ${noun} chosen`,
    divisionClearConsequence: "The list empties; anything ticked by hand has to be ticked again. Discard undoes it until you save.",
    divisionResetPresetNone: "No preset matches the current code",
    divisionResetPresetAmbiguous: (n: number) => `${n} carves share this code - click to pick one`,
    divisionPick: (noun: string) => `Choose ${noun}`,
    divisionPickTitle: (noun: string) => `Choose ${noun}`,
    divisionPickWhy: (noun: string) => `Tick ${noun}. The suffix shows where the standard carves put each one.`,
    divisionPickDone: "Done",
    divisionPickClear: "Clear",
    divisionPickEmpty: (noun: string) => `No ${noun} chosen yet`,
    divisionPickNone: (_noun: string) => "Nothing matches",
    divisionSearch: (noun: string) => `Search ${noun} by name, code or short name`,
    divisionChosen: (n: number, _noun: string) => `${n} chosen`,
    divisionHintPreset: (from: string, name: string) => `${from} ${name}`,
    divisionTakenFrom: (p: string, from: string) => `${p} currently sits in ${from} and will move here`,
    divisionSave: "Save region",
    divisionDiscard: "Discard",
    divisionSource: "Source",
    divisionSystem: "Standard",
    divisionCustom: "Custom",
    divisionEdit: "Configure",
    divisionMoveUp: "Move up",
    divisionMoveDown: "Move down",
    divisionMoveTop: "Move to top",
    divisionMoveBottom: "Move to bottom",
    divisionNew: "New region",
    divisionRemove: "Delete region",
    divisionRemoveWhy: (noun: string) => `Only a region holding no ${noun} can be deleted. Move them out first.`,
    divisionRemoveTarget: (name: string) => ` "${name}"`,
    divisionRemoveConsequence: "The region is deleted; this cannot be undone. Move what it covers to another region first.",
    divisionRemoveHeldHint: (n: number, noun: string) => `still covers ${n} ${noun}; move them first`,
    divisionDetailsTitle: (name: string) => `${name} · region details`,
    divisionDetailsWhy: (n: number, noun: string) => `Covers ${n} ${noun}.`,
    divisionDetailsDone: "Close",
    divisionCoveredBy: (n: number) => `Territories covering it · ${n}`,
    divisionCoveredNone: "No territory covers this region yet. Tick it on a territory's form.",
    divisionCoveredUnits: (units: string) => `Units: ${units}`,
    divisionCoveredNoUnits: "No unit",
    divisionRemoveCoverage: (n: number) => `${n} territories lose this coverage.`,
    templateTitle: "Apply a carve template",
    templateWhy: "Adopt a standard carve as a starting point, then edit freely.",
    templateReset: "Apply template",
    templateConfirm: "Replace",
    templateCancel: "Cancel",
    templateDangerTitle: "This replacement cannot be undone",
    templateConfirmVerb: "Replace",
    templateConfirmTarget: (carve: string) => `with ${carve}`,
    templateConsequence: (current: number, custom: number) =>
      `All ${current} regions and their members are re-laid from the preset${custom > 0 ? `; ${custom} custom regions are discarded` : ""}. It takes effect at once and cannot be undone.`,
    templateReplaceWarn: (current: number, custom: number) =>
      custom > 0
        ? `Replaces the current ${current} regions; ${custom} of them are yours and will be discarded.`
        : `Replaces the current ${current} regions.`,
    presetOption: (from: string, name: string) => `${from} - ${name}`,
    scopeLabel: {
      global: "Global",
      china: "China",
      province: "One province",
    } as Record<string, string>,
    scopeIncludes: {
      global: "Global market - regions are made of countries",
      china: "Nationwide - regions are made of provinces",
      province: "One province - regions are made of its cities",
    } as Record<string, string>,
    scopePlanned: "Not built",
    scopeLabelTitle: "Market scope",
    scopeButton: (current: string) => `Market scope - ${current}`,
    scopeProvinceFrame: (label: string, province: string) => `${label} - ${province}`,
    scopeIncludesProvince: (province: string, noun: string) => `${province} - regions are made of its ${noun}`,
    scopeProvinceLabel: "Which province",
    scopeProvinceOpen: (n: number) => `${n} provincial-level divisions available; Taiwan, Hong Kong and Macao have no lower-level data yet.`,
    scopeConfirm: "Confirm",
    scopeCancel: "Cancel",
    scopeWhy: "The frame regions are carved in: the world by country, the country by province, one province by city. Once it is set, what a region may hold follows.",
    scopeSaved: "Market scope updated",
    divisionIncludes: "Made of",
    colIndex: "#",
    colAbbr: "Code",
    colName: "Name",
    colAdcode: "Division code",
    colOps: "Actions",
    divisionRemoveMember: "Remove",
    divisionPickEmptyWhy: (noun: string) => `Use "Choose ${noun}" on the left, or start from a standard region.`,
    divisionCodePrefixHint: "The prefix comes from the market scope; type only the rest, e.g. EAST.",
    divisionCodeUnitHint: "An administrative division code (e.g. 610100) or a word of your own (e.g. GUANZHONG) - no province prefix.",
    divisionMovedTitle: (n: number, _noun: string) => `${n} will move in from other regions`,
    divisionMovedWhy: "On save they leave the regions they sit in now, and every figure grouped by region follows.",
    divisionSaveFailed: "Could not save",
    templateRef: "Start from a standard region",
    templateRefNone: "Start blank",
    templateRefWhy: "Pick one and its code, name and members are filled in - still editable.",
    divisionWhy: (frame: string, noun: string) => `How ${frame} is carved into regions, and which ${noun} each holds.`,
    divisionEmptyTitle: "This workspace has no regions yet",
    divisionEmptyWhy: "This workspace has no regions yet. Create one, or adopt a standard carve.",
    divisionNone: "Unassigned",
    divisionHoldsNothing: (noun: string) => `This region holds no ${noun}`,
    moveProvince: (p: string) => `Move ${p} to another region`,
    provinceCount: (n: number) => `${n} provinces`,
    divisionCoverage: (placed: number, divisions: number, unplaced: number, noun: string) =>
      `${placed} ${noun} in ${divisions} regions`
      + (unplaced > 0 ? `, ${unplaced} ${noun} in no region` : ""),
    divisionAllPlaced: (noun: string) => `Every one of the ${noun} is assigned.`,
    divisionUnplacedLead: (n: number, noun: string) => `${n} ${noun} in no region:`,
    territoryWhy:
      "Who carries which patch of the market. A territory is one of the scopes a target can be set on - with no territory there is no regional target.",
    territoryFormWhy:
      "The code is the identity: an existing code edits that territory, a new one creates it. Pick the regions it covers, or routing cannot find it.",
    territoryNone: "No territories yet",
    territoryNoneWhy:
      "Create one before setting a target on it or attributing deals to it.",
    territoryNewEntry: "New territory",
    targetNew: "New target",
    territoryFormTitle: "New / edit territory",
    territoryEditing: "Edit an existing territory",
    territoryNew: "Create a new territory",
    territoryRegions: "Regions covered",
    territoryRegionsHint: "Tick the regions this territory works. A region may be worked by more than one territory; ticking none means it covers nothing, and routing treats it that way.",
    territoryRegionsNone: "This workspace has no regions yet. Create one, or adopt a standard carve.",
    territoryRegionGone: "no longer in the current carve",
    territoryUnits: "Units",
    territoryUnitsHint: "Tick the units that work this territory. Several may share it; none means nobody works it.",
    territoryUnitsNone: "No units yet. Create them under Organization first.",
    territoryNoUnit: "No unit",
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
      no_snapshot:
        "No forecast snapshot has been submitted for this scope this period - that is not 0% attained",
      no_cost_data:
        "Margin needs cost, and cost is not in the model yet. Not a missed period, and not a metric that cannot be computed - supply cost and it can be",
      not_counted:
        "This snapshot carries no new-logo count - it predates the field, or its period label could not be parsed into dates",
    } as Record<string, string>,
    setSubmit: "Create target",
    setSaved: "Created",
    setDenied: "You cannot set targets",
    adjust: "Adjust the amount",
    adjustSaved: "Adjusted",
    commit: "Commit it",
    commitWhy:
      "Committing cannot be undone - a number already reported upward does not come back",
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
    leadNotMeasured: (target: string, reason: string) =>
      `Workspace target ${target} - ${reason || "not measured yet"}`,
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
    segmentNoun: "segment",
    planNoun: "plan",
    tagSegmentActive: (n: number) => `${n} in use`,
    tagSegmentShelved: (n: number) => `${n} shelved`,
    segmentStatCovered: (assigned: number, matched: number) =>
      assigned === matched ? `${assigned} on the books` : `${assigned} assigned · ${matched} matched`,
    segmentStatEmpty: "No segments yet - the breakdown starts with the first one",
    rosterSegment: "Segments",
    rosterSegmentWhy:
      "A segment is a definition plus the accounts on its books. When the two numbers differ, a code was handed out against the definition, or the definition found customers nobody cut in.",
    rosterSegmentShelved: "Shelved segments",
    rosterSegmentShelvedWhy:
      "A paused or retired segment no longer drives campaigns, but its history stays readable, so it is kept.",
    colSegmentName: "Segment",
    colSegmentPlan: "Plan",
    colSegmentCriteria: "Definition",
    colSegmentCounts: "Assigned / matched",
    segmentNoCriteriaYet: "Not defined",
    segmentPause: "Pause",
    segmentResume: "Resume",
    segmentRetire: "Retire",
    segmentDeleteConsequence:
      "Deletion is permanent. Refused while campaigns aim at it or accounts carry its code - retire it in that case.",
    newSegmentEntry: "New segment",
    editSegment: "Edit segment",
    segmentAdviceTitle: "Segment check",
    segmentAdviceClear: "Nothing to act on in the segments in use.",
    segmentAdviceAssigned: (name: string, n: number) =>
      `${n} account(s) carry ${name}'s code without matching its definition.`,
    segmentAdviceMatching: (name: string, n: number) =>
      `${name}'s definition matches ${n} account(s) nobody has cut in.`,
    segmentAdviceStale: (name: string, n: number) =>
      `${name} is shelved, yet ${n} account(s) still carry its code.`,
    segmentAdviceNoCriteria: (name: string) => `${name} has no definition, so it matches nobody.`,
    segmentAdviceNoPlan: (name: string) => `${name} is tied to no plan - nobody is spending against it.`,
    segmentAdviceOpen: "Open the segment",
    segmentAdviceOpenAccounts: "Open customers",
    segmentsTitle: "Market segments",
    segmentsWhy:
      "The market you are going after, cut into named pieces and ordered by priority. Accounts carry a segment code that points here, and a campaign can aim at one - until now every one of those references pointed at nothing.",
    segmentsNone: "No segments yet",
    segmentsNoneWhy:
      "Account records already use segment codes, but nothing defines them yet. Create one below and matching codes connect.",
    segmentsDenied: "You do not have permission to edit segments.",
    segmentFormTitle: "New / edit segment",
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
    leadNoCampaignRead:
      "No permission to read campaigns, so downstream cannot be counted.",
    columnCampaigns: "Downstream",
    ownerNone: "Unassigned",
    columnName: "Strategy",
    columnPeriod: "Period",
    columnOwner: "Owner",
    emptyTitle: "No strategies yet",
    emptyDescription:
      "Define which market to attack this period and what to achieve.",

    tagPlanRunning: (n: number) => `${n} running`,
    tagPlanSettled: (n: number) => `${n} settled`,
    tagPlanOrphan: (n: number) => `${n} campaigns with no plan`,
    planStatCampaigns: (period: string) => `${period} · campaigns`,
    planStatEmpty: "No plan is running, so there is nothing to break down.",
    rosterPlan: "Plans",
    rosterPlanWhy:
      "Which market this period attacks and what it is meant to achieve. Plans are ordered by their period - there is no manual rank, because the period already is the order.",
    rosterPlanSettled: "Settled plans",
    rosterPlanSettledWhy:
      "Closed and archived plans stay here. They take no further edits, and downstream records still point at them.",
    newPlanEntry: "New plan",
    planMoveTo: (status: string) => `Move to ${status}`,
    planSave: "Save changes",
    planNoFixed: "The number is this plan's identity and cannot be changed after it is created.",
    editPlanTitle: "Edit plan",
    editPlanWhy:
      "The name, period, owner and objective can change. The number is the anchor downstream records quote, and the status belongs to the lifecycle.",

    planAdviceTitle: "Plan check",
    planAdviceClear: "Nothing on these plans needs attention.",
    planAdviceOpen: "Open the plan",
    planAdviceOpenCampaigns: "See campaigns",
    planAdviceOpenSegments: "See segments",
    planAdviceApprove: "Approve",
    planAdviceApproved: "Approved",
    planAdviceOverdue: (name: string) => `"${name}" is past the end of its period and still running.`,
    planAdviceDraftStarted: (name: string) => `"${name}" has started its period and is still a draft.`,
    planAdviceNotActive: (name: string) =>
      `"${name}" was approved and its period has begun, but it was never switched on.`,
    planAdviceEarlyWork: (name: string, n: number) =>
      `"${name}" is not live yet and ${n} campaigns already hang off it.`,
    planAdviceNoCampaign: (name: string) => `"${name}" is running with no campaign under it.`,
    planAdviceNoSegment: (name: string) => `"${name}" is running and no segment points at it.`,
    planAdviceNoObjective: (name: string) => `"${name}" states no objective.`,
    segmentCount: (n: number) => `${n} segments`,
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
    why: "Actions the copilot proposes and a person decides on. The machine proposes; accepting is yours (ADR-003).",
    tagAwaiting: (n: number) => (n === 0 ? "Nothing awaiting you" : `${n} awaiting your call`),
    tagLowConfidence: (n: number) => `${n} low confidence`,
    detailRationale: "Full rationale",
    detailPayload: "What it would change",
    detailCapability: "Proposed by",
    detailProposedAt: "Proposed",
    detailExpand: "Expand",
    detailCollapse: "Collapse",
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
    executionFailed: (count: number, reason: string) =>
      `Accepted, but ${count} could not be carried out: ${reason}. Those are marked failed; a retry is a new proposal.`,
    acceptedForManual: (count: number) =>
      `Accepted. ${count} of these cannot be performed automatically and need a person; they stay accepted rather than being marked failed.`,
    manualBadge: "Needs a person",
    joinLabels: (labels: readonly string[]) => labels.join(", "),
    acceptManualNote: (manual: number, total: number) =>
      `${manual} of these ${total} will not be performed automatically (outreach, for one - a sent message cannot be unsent). Accepting records your judgement; the work still needs a person.`,
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
    searchHint: "Rationale",
    filterAllStatus: "All states",
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

  ADMIN_GROUP_LABEL: {
    org: "Organisation",
    access: "People and access",
    params: "Business parameters",
    ops: "Operations",
  },
  PERMISSION_TREE_TEXT: {
    title: "Permission policy",
    why: "Four levels - domain, module, page, operation; the permission each operation needs, and the roles holding it. Permissions are system preset; grants are edited under Roles.",
    count: (actions: number, roles: number) => `${actions} operations · ${roles} roles`,
    colPoint: "Name",
    colLevel: "Type",
    // 层级 / 子级 (owner, 2026-09-11): pulled the L0-L3 pill and the child
    // count out of the name column into their own independent columns.
    colTier: "Tier",
    colChildren: "Children",
    colOps: "Actions",
    colSource: "Source",
    source: "System preset",
    searchLabel: "Search permissions",
    searchHint: "Search by name or code",
    domainFilterLabel: "Domain",
    filterAllDomains: "All domains",
    resetFilters: "Reset filters",
    toolbarCount: (n: number) => `${n} operations`,
    toolbarFilteredCount: (shown: number, total: number) => `${shown} / ${total} operations`,
    filterEmpty: "No permission point matches. Try a different keyword, level, or domain.",
    levelFilterLabel: "Level",
    filterAllLevels: "All levels",
    copyCode: "Copy permission code",
    codeCopied: (code: string) => `Copied: ${code}`,
    copyFailed: "Copy failed - select the text instead",
    overviewTotal: "Operations",
    overviewRoles: "Roles",
    overviewUnheld: "Unheld",
    colHolders: "Roles",
    holdersNone: "No role holds it",
    holdersTitle: (op: string, n: number) => `${op} · ${n} roles may`,
    holdersTitleBranch: (name: string, n: number) => `${name} · ${n} role(s) may do at least one thing under it`,
    levelLabel: {
      domain: "Domain",
      module: "Module",
      page: "Page",
      action: "Operation",
    } as Record<string, string>,
    // A placeholder module - no page, no permission point yet (owner,
    // 2026-09-11): see PLACEHOLDER_MODULES.
    modulePending: "Permission point pending",
    expandTo: "Expand to",
    collapseAll: "Collapse all",
    granted: "Granted",
    notGranted: "Not granted",
    // The two planes, plus the two crosscutting modules (owner, 2026-09-11) -
    // neither owns an object either, same reason Copilot doesn't sit inside
    // a business group.
    groupLabel: {
      copilot: "Copilot",
      admin: "Configuration",
      home: "Today's calls",
      national: "Sales screen",
    } as Record<string, string>,
    moduleLabel: {
      admin: "Members and access",
    } as Record<string, string>,
    pageLabel: {
      "strategy.plan": "Strategy plans",
      "strategy.segment": "Segments",
      "planning.territory": "Territories",
      "planning.target": "Targets",
      "planning.attainment": "Attainment",
      // Synthesized pages for a module's own module-level actions (owner,
      // 2026-09-11) - reuse the module's own DOMAIN_LABEL text, same as zh.
      "campaign.base": "Campaigns",
      "campaign.execution": "Campaign execution",
      "account.contact": "Contacts",
      "account.interaction": "Interactions",
      "account.commitment": "Commitments",
      "account.graph": "Relationship graph",
      "account.base": "Accounts",
      "signal.base": "Opportunity signals",
      "signal.feed": "Signal feeds",
      "signal.lead": "Leads",
      "pipeline.base": "Pipeline",
      "pipeline.opportunity": "Opportunities",
      "pipeline.discount": "Discount approval",
      "pipeline.forecast": "Forecast",
      "pipeline.winloss": "Win/loss review",
      "delivery.project": "Projects",
      "delivery.milestone": "Milestones",
      "delivery.revenue": "Collections",
      "copilot.session": "Sessions",
      "copilot.base": "Copilot",
      "copilot.action": "Suggestions",
      "copilot.playbook": "Playbooks",
      "copilot.autopilot": "Autopilot",
      "catalog.product": "Products",
      "catalog.solution": "Solutions",
      "catalog.pricebook": "Price book",
      "admin.member": "Members",
      "admin.adoption": "Adoption",
      "admin.role": "Roles",
      "admin.org": "Organization",
    } as Record<string, string>,
    actionLabel: {
      "strategy.plan.view": "View strategy plans",
      "strategy.plan.create": "Create a strategy plan",
      "strategy.plan.update": "Edit a strategy plan",
      "strategy.plan.approve": "Approve a strategy plan",
      "strategy.segment.view": "View segments",
      "strategy.segment.upsert": "Maintain segments",
      "planning.territory.view": "View territories",
      "planning.territory.upsert": "Maintain territories",
      "planning.target.view": "View targets",
      "planning.target.create": "Set a target",
      "planning.target.update": "Adjust a target",
      "planning.attainment.view": "View attainment",
      "campaign.view": "View campaigns",
      "campaign.upsert": "Maintain campaigns",
      "campaign.execution.view": "View campaign execution",
      "campaign.execution.upsert": "Record campaign execution",
      "account.view": "View accounts",
      "account.upsert": "Maintain accounts",
      "account.contact.upsert": "Maintain contacts",
      "account.interaction.record": "Record an interaction",
      "account.commitment.upsert": "Maintain commitments",
      "account.commitment.settle": "Settle a commitment",
      "account.graph.view": "View the relationship graph",
      "account.graph.link": "Link accounts",
      "signal.view": "View signals",
      "signal.triage": "Triage signals",
      "signal.rescore": "Rescore signals",
      "signal.feed.configure": "Configure feeds",
      "signal.feed.ingest": "Ingest signals",
      "signal.lead.view": "View leads",
      "signal.lead.upsert": "Maintain leads",
      "signal.lead.convert": "Convert a lead",
      "pipeline.view": "View opportunities",
      "pipeline.opportunity.create": "Create an opportunity",
      "pipeline.opportunity.update": "Edit an opportunity",
      "pipeline.discount.approve": "Approve a discount",
      "pipeline.opportunity.advance": "Advance a stage",
      "pipeline.forecast.view": "View the forecast",
      "pipeline.forecast.snapshot": "Submit a forecast snapshot",
      "pipeline.forecast.categorize": "Categorise the forecast",
      "pipeline.winloss.view": "View win/loss reviews",
      "pipeline.winloss.record": "Record a win/loss review",
      "delivery.project.view": "View projects",
      "delivery.project.upsert": "Maintain projects",
      "delivery.milestone.upsert": "Maintain milestones",
      "delivery.revenue.view": "View collections",
      "delivery.revenue.upsert": "Record a collection",
      "copilot.session.open": "Open a copilot session",
      "copilot.ask": "Ask the copilot",
      "copilot.suggest": "Get suggestions",
      "copilot.action.decide": "Decide a suggestion",
      "copilot.action.decide_batch": "Decide suggestions in bulk",
      "copilot.autopilot.enable": "Enable autopilot",
      "copilot.playbook.view": "View playbooks",
      "copilot.action.view": "View suggestions",
      "copilot.playbook.upsert": "Maintain playbooks",
      "catalog.product.view": "View products",
      "catalog.product.upsert": "Maintain products",
      "catalog.solution.view": "View solutions",
      "catalog.solution.upsert": "Maintain solutions",
      "catalog.pricebook.view": "View the price book",
      "catalog.pricebook.upsert": "Maintain the price book",
      "admin.member.view": "View members",
      "admin.adoption.view": "View adoption",
      "admin.member.role.assign": "Assign a role",
      "admin.member.role.revoke": "Revoke a role",
      "admin.member.deactivate": "Deactivate a member",
      "admin.member.reactivate": "Reactivate a member",
      "admin.member.scope": "Set data scope",
      "admin.role.upsert": "Create or configure a role",
      "admin.role.remove": "Delete a role",
      "admin.org.upsert": "Create or configure a unit",
      "admin.org.remove": "Delete a unit",
    } as Record<string, string>,
    roleShort: {
      sales_leader: "Lead",
      marketing_manager: "Mktg",
      sales_rep: "Rep",
      presales: "Presales",
      delivery_manager: "Delivery",
      sales_ops: "Ops",
      viewer: "Viewer",
      sales_manager: "Mgr",
      regional_director: "Director",
      executive: "Exec",
      finance: "Finance",
      workspace_admin: "Admin",
      senior_sales_manager: "Sr Mgr",
      regional_general_manager: "RGM",
      channel_manager: "Channel",
      senior_channel_manager: "Sr Chan",
      senior_delivery_manager: "Sr Deliv",
      senior_presales: "Sr Presales",
      marketing_specialist: "Mktg Spec",
      sales_ops_specialist: "Ops Spec",
      key_account_manager: "KAM",
      sdr: "SDR",
      deal_desk: "Deal desk",
      customer_success: "CSM",
      sales_director: "Sales dir",
      branch_general_manager: "Branch GM",
      channel_head: "Chan head",
      delivery_head: "Deliv head",
      presales_head: "Presales head",
      marketing_head: "Mktg head",
      ops_head: "Ops head",
    } as Record<string, string>,
  },
  PERMISSION_LABEL: {
    "strategy.read": "View strategy and market segments",
    "strategy.write": "Edit strategy and market segments",
    "strategy.approve": "Approve a plan - the moment it becomes a commitment",
    "planning.read": "View planning",
    "planning.write": "Edit territories and targets",
    "campaign.read": "View campaigns",
    "campaign.write": "Edit campaigns and executions",
    "account.read": "View accounts",
    "account.write": "Edit accounts, contacts and the relationship graph",
    "account.record": "Record what happened - interactions and commitments, not the master record",
    "signal.read": "View signals",
    "signal.triage": "Triage signals - score, match, promote, dedup",
    "pipeline.read": "View opportunities",
    "pipeline.write": "Edit opportunities and advance stages",
    "pipeline.forecast": "Submit forecast snapshots",
    "pipeline.discount": "Authorise a price below the product floor",
    "delivery.read": "View delivery projects",
    "delivery.write": "Edit milestones, tasks and revenue schedules",
    "copilot.use": "Use the copilot - open sessions and ask",
    "copilot.decide": "Accept or reject what the copilot proposes",
    "copilot.autopilot": "Authorise autonomous execution",
    "catalog.read": "Read the catalogue, solutions and price books",
    "catalog.write": "Maintain products and solutions",
    "catalog.price": "Set list and floor prices - the floor decides which discounts need a signature",
    "admin.manage": "Administration - roles and the workspace catalogues",
  },
  SCOPE_LABEL: {
    workspace: "Whole workspace",
    territory: "Their territories",
    own: "Their own rows",
  },
  ADMIN_PAGE_TEXT: {
    rolesTitle: "Roles",
    rolesWhy: "The nine roles and what each may do. Read-only.",
    rolesColumnRole: "Role",
    rolesColumnPerms: "Permissions",
    rolesColumnMembers: "Members",
    rolesColumnList: "What it may do",
    rolesMembers: (n: number) => `${n}`,
    rolesNoMember: "Nobody holds it",
    permissionsTitle: "Permissions",
    permissionsWhy: "The twenty-five permissions and who holds each. Read-only.",
    permissionsColumnCode: "Code",
    permissionsColumnName: "What it allows",
    permissionsColumnRoles: "Held by",
    permissionsNoRole: "No role holds it",
    permissionsCount: (perms: number, roles: number, grants: number) =>
      `${perms} permissions · ${roles} roles · ${grants} grants`,
    scopeTitle: "Data scope",
    scopeWhy: "Who can see which rows. Scope is changed under Members.",
    scopeColumnMember: "Member",
    scopeColumnScope: "Scope",
    scopeColumnDetail: "Covers",
    scopeTerritories: (n: number) => `${n} territories`,
    scopeNoTerritory: "No territory assigned - this member sees nothing",
    scopeCount: (n: number) => `${n} members`,
  },
  MEMBER_TEXT: {
    title: "Organisation",
    description: "Who sits in which unit: territories, data scope and roles.",
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
    columnLifecycle: "Standing",
    inactive: "Inactive",
    inactiveHint:
      "Has left. The row is kept forever - it is what makes a signature in the audit trail readable; deleting it breaks no foreign key, it just turns every signature into an id nobody recognises.",
    deactivate: "Deactivate",
    deactivateHint:
      "Takes every role away and marks them inactive. The row is not deleted.",
    reactivate: "Reactivate",
    reactivateHint:
      "Restores standing only. No role comes back - each must be granted again.",
    invite: "Invite a member",
    handoverTo: "Hand over to",
    handover: "Hand over",
    handoverHint:
      "Moves the live accounts, deals and leads to this person. Closed deals stay put - that is who won them, and it is history - and so do targets and forecast snapshots.",
    handoverDone: (accounts: number, deals: number, leads: number) =>
      `Handed over: ${accounts} accounts, ${deals} deals, ${leads} leads.`,
    handoverPartial: (skipped: number) => `${skipped} were refused by a rule.`,
    columnUnit: "Units",
    unitNone: "Unplaced",
    viewAria: "View",
    viewList: "List",
    viewOrg: "Organisation",
    orgHeadcount: (n: number) => `${n}`,
    orgNoMembers: "Nobody here yet",
    orgUnplaced: "Not in any unit",
    orgUnplacedWhy: "Members placed in no unit yet. Tick their units under member settings.",
    orgExpandAll: "Expand all",
    orgCollapseAll: "Collapse all",
    orgColUnit: "Unit",
    orgColMembers: "Members",
    orgAdd: "Add members",
    orgAddTitle: (unit: string) => `Add members to "${unit}"`,
    orgAddWhy: "Tick the active members to place in this unit. A person may be in several units.",
    orgAddNone: "Every active member is already in this unit.",
    orgRemove: "Remove members",
    orgRemoveTitle: (unit: string) => `Remove members from "${unit}"`,
    orgRemoveWhy: "Tick the members to take out of this unit. Their other units are untouched.",
    orgConfirm: "Confirm",
    orgColName: "Name",
    orgColTerritories: "Territories",
    orgColScope: "Data scope",
    orgTerritoriesNone: "None",
    orgInactiveTitle: (n: number) => `Deactivated · ${n}`,
    orgInactiveWhy: "People who have left are out of the tree. The rows stay forever; roles must be granted again on reactivation.",
    orgSelectionNoun: "people",
    orgClearSelection: "Clear selection",
    orgBulkRemove: "Remove from unit",
    orgBulkRemoveTarget: (n: number) => `the ${n} selected (from their units)`,
    orgBulkRemoveWhy: "Ends only the placements the selected rows sit in; other units and roles are untouched.",
    orgBulkMove: "Move to unit",
    orgBulkMoveTitle: (n: number) => `Move the ${n} selected to`,
    orgBulkMoveWhy: "Each leaves the unit its row sits in for the target; other units stay.",
    orgBulkCopy: "Also place in unit",
    orgBulkCopyTitle: (n: number) => `Also place the ${n} selected in`,
    orgBulkCopyWhy: "Joins the target unit while keeping every current placement.",
    orgBulkDone: (n: number, unit: string) => `Done for ${n}: ${unit}.`,
    orgBulkRemoved: (n: number) => `Removed ${n} from their units.`,
    orgExpand: (name: string) => `Expand ${name}`,
    orgCollapse: (name: string) => `Collapse ${name}`,
    orgTargetUnit: "Target unit",
    orgPickUnit: "Pick a unit",
    orgMoveTo: "Move to unit",
    orgMoveTitle: (name: string, from: string) => `Move ${name} from "${from}" to`,
    orgMoveWhy: "Only this placement moves; their other units stay.",
    orgAddTo: "Add to units",
    orgAddToTitle: (name: string) => `Add ${name} to more units`,
    orgAddToWhy: "Tick the units to join; the ones they are in stay. New roles can be granted alongside.",
    orgAddToRoles: "Also grant roles",
    orgAddToNoUnit: "Already in every unit.",
    orgRemoveOne: "Remove from this unit",
    orgRemoveOneTarget: (name: string, unit: string) => `"${name}" from "${unit}"`,
    orgRemoveOneWhy: "Only this placement ends; other units and roles are untouched.",
    orgMoved: (name: string, unit: string) => `Moved ${name} to "${unit}".`,
    orgAddedTo: (name: string, units: number, roles: number) => `Added ${name} to ${units} unit(s)${roles > 0 ? `, granted ${roles} role(s)` : ""}.`,
    orgRemovedOne: (name: string, unit: string) => `Removed ${name} from "${unit}".`,
    orgPlaced: (n: number, unit: string) => `Added ${n} to "${unit}".`,
    orgRemoved: (n: number, unit: string) => `Removed ${n} from "${unit}".`,
    columnScope: "Sees",
    scopeTerritory: "Pick a territory",
    scopeLabels: {
      workspace: "Whole workspace",
      territory: "Their territory",
      own: "Only their own",
      unit: "Their unit",
    } as Record<string, string>,
    scopeUnitUnplaced: "Placed in no unit; sees only unowned records",
    noun: "member",
    count: (active: number, inactive: number) => `${active} active${inactive > 0 ? ` · ${inactive} inactive` : ""}`,
    active: "Active",
    detailsTitle: (name: string) => `${name} · member details`,
    detailsDone: "Close",
    detailsEdit: "Edit member",
    territoriesNone: "No territory ticked yet.",
    deactivateMenu: "Deactivate member",
    deactivateTarget: (name: string) => `"${name}"`,
    handoverMenu: "Hand over book",
    handoverTitle: (name: string) => `Hand over ${name}'s book`,
    handoverConfirm: "Confirm handover",
    handoverNoHeir: "No other active member can receive it.",
    destructiveTitle: "{verb} {target}?",
    cancel: "Cancel",
    formTitle: "Member settings",
    formWhy: "Roles, unit and what they may see.",
    rolesField: "Roles",
    rolesHint: "Tick the roles this member holds; permissions follow the roles.",
    rolesNone: "The workspace has no roles yet. Create one under Roles first.",
    unitField: "Units",
    unitConfigure: "Configure",
    unitsHint: "Tick every unit they belong to; the unit scope is the union of their subtrees.",
    unitsNone: "The organisation has no units yet. Create one under Organisation first.",
    scopeField: "Sees",
    territoriesField: "Territories",
    territoriesHint: "For the territory scope: tick what they may see, children included.",
    save: "Save member",
    discard: "Discard",
    saveFailed: "Save failed",
  },

  MEMBER_ERROR: {
    ...GATE_ERROR,
    unit_unknown: "That unit does not exist; it may have just been deleted",
    same_owner:
      "The person handing over and the person receiving are the same.",
    owner_required: "A handover needs somebody to hand over to.",
    recipient_not_a_member: "The recipient is not a member of this workspace.",
    recipient_inactive:
      "The recipient has also left - handing over would make this work invisible to a second person.",
    lead_converted:
      "This lead already became an opportunity, and that carries its own owner.",
    empty_patch: "Nothing to change.",
    amount_negative: "A deal cannot be worth less than nothing.",
    probability_range: "A win rate is a whole number from 0 to 100.",
    terminal_probability_fixed:
      "A closed deal keeps the win rate it closed with.",
    terminal_requires_closed:
      "Winning or losing a deal must set its close date too.",
    closed_requires_terminal_stage:
      "Forecasting as closed requires a closed stage.",
    unknown_forecast_category: "That is not a forecast category.",
    last_admin:
      "This is the workspace's last administrator; removing it leaves nobody able to assign roles",
    unknown_role: "That role is not in the catalog",
    sub_required: "Pick a member",
    not_found: "That member does not belong to this workspace",
    not_authenticated: "Your session has expired; sign in again",
    permission_denied: "You hold no permission to manage member roles",
    no_data_access: "This workspace has no access",
    unknown_scope: "Unknown scope",
    territory_required: "A territory scope needs at least one territory ticked",
  },

  ROLE_LABEL: {
    sales_leader: "Sales leader",
    sales_manager: "Sales manager",
    regional_director: "Regional sales director",
    marketing_manager: "Senior marketing manager",
    sales_rep: "Sales rep",
    presales: "Presales",
    delivery_manager: "Delivery manager",
    sales_ops: "Senior operations manager",
    viewer: "Viewer",
    executive: "Executive",
    finance: "Finance administrator",
    workspace_admin: "Workspace administrator",
    senior_sales_manager: "Senior sales manager",
    regional_general_manager: "Regional general manager",
    channel_manager: "Channel manager",
    senior_channel_manager: "Senior channel manager",
    senior_delivery_manager: "Senior delivery manager",
    senior_presales: "Senior presales",
    marketing_specialist: "Marketing specialist",
    sales_ops_specialist: "Operations specialist",
    key_account_manager: "Key account manager",
    sdr: "Sales development representative",
    deal_desk: "Deal desk",
    customer_success: "Customer success manager",
    sales_director: "Sales director",
    branch_general_manager: "Branch general manager",
    channel_head: "Head of channel",
    delivery_head: "Head of delivery",
    presales_head: "Head of presales",
    marketing_head: "Head of marketing",
    ops_head: "Head of operations",
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
    signal: "Opportunity signals",
    delivery: "Project delivery",
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
    pendingEmpty: "Nothing is waiting on you right now.",
    recentEmpty: "Nothing captured recently.",
    reconTitle: "Competition",
    reconEmpty:
      "Nothing scouted yet. Rivals appear only inside note text so far; there is no formed intelligence.",
    reconCta: "Run a competitive analysis",
    analysisNote: 'The result enters the feed as a "model" judgement.',
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
