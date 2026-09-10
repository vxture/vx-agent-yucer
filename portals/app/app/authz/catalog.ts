// Permission gate catalog (docs/20-specs/50-role-permission-catalog.md).
//
// AUTHORITY NOTE: local_authz.role / permission / role_permission in the database
// are the runtime authority; those tables are seeded by
// deploy/database/ddl/incr/0001_seed_authz_catalog.sql and are runtime-read-only
// (98_column_locks.sql revokes UPDATE). This file is a TYPED MIRROR of that seed,
// not a second source of truth: catalog.test.ts parses the seed SQL and asserts
// exact parity, so drift fails the build rather than diverging silently.
//
// The mirror exists because three consumers need the catalog without a database:
// the offline/in-memory store, compile-time PermCode checking, and the UI's
// affordance computation (which buttons even render).
//
// These are PRODUCT FUNCTION roles. They are NOT the platform governance roles
// (owner/manager/member/readonly/guest, see auth/lib/claims.ts) and there is
// deliberately no mapping table between the two.

export const PERM_CODES = [
  // D1 strategy
  "strategy.read",
  "strategy.write",
  // D2 planning
  "planning.read",
  "planning.write",
  // D3 campaign
  "campaign.read",
  "campaign.write",
  // D4 account
  "account.read",
  "account.write",
  // D5 signal
  "signal.read",
  "signal.triage",
  // D6 pipeline
  "pipeline.read",
  "pipeline.write",
  "pipeline.forecast",
  // D7 delivery
  "delivery.read",
  "delivery.write",
  // D8 copilot
  "copilot.use",
  "copilot.decide",
  "copilot.autopilot",
  // Product administration (NOT platform governance).
  "admin.manage",
  // --- added by numbered increment, and therefore listed in ARRIVAL order ---
  // Not grouped with the other D1 codes above, because this list mirrors the
  // seed and the seed grows by append-only increment. Regrouping for tidiness
  // would break the order parity that catches an accidental reshuffle.
  //
  // strategy.approve (incr/0002): approving a plan is not editing one. It is the
  // moment a plan becomes the number the rest of the chain is measured against,
  // and the same shape as the pipeline.write / pipeline.forecast split one level
  // down - "owns the deal, not the forecast commitment".
  "strategy.approve",
  // --- catalog (incr/0010), ADR-017 -----------------------------------------
  // The catalogue partition carries no feature key, so permissions are the ONLY
  // gate on it. Three, not two, because the floor price is a different job from
  // editing the catalogue - see the note in actions.ts.
  "catalog.read",
  "catalog.write",
  "catalog.price",
  // --- evidence capture (incr/0011), ADR-018 --------------------------------
  // Recording what happened is NOT editing the customer master record, and
  // collapsing them left the people who meet customers most unable to write
  // anything down. See ADR-018.
  "account.record",
  // --- discount authority (incr/0012), ADR-019 ------------------------------
  // Separate from pipeline.write on purpose: the person who quotes below the
  // floor must not be the person who signs it off, or the floor constrains
  // nobody. Not a feature key - keys are frozen at 19 and a signature is not
  // separately sellable.
  "pipeline.discount",
] as const;

export type PermCode = (typeof PERM_CODES)[number];

export const ROLE_CODES = [
  "sales_leader",
  "marketing_manager",
  "sales_rep",
  "presales",
  "delivery_manager",
  "sales_ops",
  "viewer",
  // 0021, the owner's ruling of 2026-09-01. ORDER MIRRORS THE SEED, which
  // appends - catalog.test.ts compares these lists element for element, so a
  // "tidier" alphabetical order here would read as drift.
  "sales_manager",
  "regional_director",
  // 0047, the owner's ruling of 2026-09-09: 集团级 - fifteen more rungs and
  // functions, so a tenant seldom needs a role of its own. Seed order, again.
  "executive",
  "finance",
  "workspace_admin",
  "senior_sales_manager",
  "regional_general_manager",
  "channel_manager",
  "senior_channel_manager",
  "senior_delivery_manager",
  "senior_presales",
  "marketing_specialist",
  "sales_ops_specialist",
  "key_account_manager",
  "sdr",
  "deal_desk",
  "customer_success",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

// Grants are listed literally, exactly as the seed lists them. They are NOT
// derived by pattern (no "every *.read" sweep): a permission added later must be
// granted deliberately, per role, in both places.
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermCode[]> = {
  // Accountable for the whole chain, and the only role that may authorize the
  // copilot to act without a human decision.
  sales_leader: [
    "strategy.read",
    "strategy.write",
    "strategy.approve",
    "planning.read",
    "planning.write",
    "campaign.read",
    "campaign.write",
    "account.read",
    "account.write",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.forecast",
    "delivery.read",
    "delivery.write",
    "copilot.use",
    "copilot.decide",
    "copilot.autopilot",
    "admin.manage",
    "catalog.read",
    "catalog.write",
    "catalog.price",
    "account.record",
    // incr/0012: signing off a below-floor price. Separate from pipeline.write
    // so the person who quotes the discount is not the person who allows it.
    "pipeline.discount",
  ],
  // Demand side, up to the lead handoff: triages signals but never edits a deal.
  marketing_manager: [
    "strategy.read",
    "strategy.write",
    "campaign.read",
    "campaign.write",
    "signal.read",
    "signal.triage",
    "account.read",
    "pipeline.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  // Owns the deal, not the forecast commitment (pipeline.write without
  // pipeline.forecast is the deliberate split).
  sales_rep: [
    "account.read",
    "account.write",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  presales: [
    "account.read",
    "account.write",
    "pipeline.read",
    "delivery.read",
    "copilot.use",
    "catalog.read",
    "account.record",
  ],
  delivery_manager: [
    "delivery.read",
    "delivery.write",
    "account.read",
    "pipeline.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  // Sets the rules (quota, territory, forecast discipline, role assignment) but
  // does not edit the deals - the rule-setter is not also the data-editor.
  sales_ops: [
    "planning.read",
    "planning.write",
    "pipeline.read",
    "pipeline.forecast",
    "account.read",
    "campaign.read",
    "strategy.read",
    "admin.manage",
    "copilot.use",
    "catalog.read",
    "catalog.write",
    "catalog.price",
    // Setting the floor and granting an exception to it are two halves of one
    // authority; ops can already move a floor, so withholding the
    // transaction-level exception would be theatre, not separation of duties.
    "pipeline.discount",
  ],
  // Read-only, but keeps copilot.use: asking a question produces no write.
  viewer: [
    "strategy.read",
    "planning.read",
    "campaign.read",
    "account.read",
    "signal.read",
    "pipeline.read",
    "delivery.read",
    "copilot.use",
    "catalog.read",
  ],

  // --- 0021: the two rungs between a rep and the whole organisation ---------
  //
  // A REP WHO COMMITS A NUMBER UPWARD. The catalogue already draws this line one
  // level down - sales_rep holds pipeline.write WITHOUT pipeline.forecast,
  // "owns the deal, not the forecast commitment" - and a first-line manager is
  // the person who makes that commitment. planning.read comes with it: you
  // cannot commit against a target you cannot see.
  sales_manager: [
    "account.read",
    "account.write",
    "account.record",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.forecast",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "planning.read",
  ],

  // A MANAGER WHO MAY APPROVE BELOW THE FLOOR and set the targets their region
  // is measured against.
  //
  // NOT catalog.price, deliberately: approving a discount against the floor and
  // deciding where the floor sits are different acts, and the second stays with
  // sales_ops and sales_leader (ADR-019). A director who could move the floor
  // would be approving against a line they had drawn themselves.
  //
  // No admin.manage, no copilot.autopilot, no strategy.approve - running the
  // sales organisation and administering the workspace are not one job.
  regional_director: [
    "account.read",
    "account.write",
    "account.record",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.forecast",
    "pipeline.discount",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "planning.read",
    "planning.write",
    "strategy.read",
  ],
  // --- 0047: the ladder. Each rung is the one below plus something concrete. ---
  executive: [
    "strategy.read",
    "planning.read",
    "campaign.read",
    "account.read",
    "signal.read",
    "pipeline.read",
    "delivery.read",
    "catalog.read",
    "strategy.approve",
    "copilot.use",
    "copilot.decide",
  ],
  finance: [
    "strategy.read",
    "planning.read",
    "campaign.read",
    "account.read",
    "signal.read",
    "pipeline.read",
    "delivery.read",
    "catalog.read",
    "catalog.price",
    "pipeline.discount",
    "copilot.use",
  ],
  workspace_admin: [
    "strategy.read",
    "planning.read",
    "campaign.read",
    "account.read",
    "signal.read",
    "pipeline.read",
    "delivery.read",
    "catalog.read",
    "admin.manage",
    "copilot.use",
  ],
  senior_sales_manager: [
    "account.read",
    "account.write",
    "account.record",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.forecast",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "planning.read",
    "pipeline.discount",
    "strategy.read",
  ],
  regional_general_manager: [
    "account.read",
    "account.write",
    "account.record",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.forecast",
    "pipeline.discount",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "planning.read",
    "planning.write",
    "strategy.read",
    "strategy.write",
    "strategy.approve",
    "campaign.write",
    "delivery.write",
  ],
  channel_manager: [
    "account.read",
    "account.write",
    "signal.read",
    "pipeline.read",
    "pipeline.write",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  senior_channel_manager: [
    "account.read",
    "account.write",
    "signal.read",
    "pipeline.read",
    "pipeline.write",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
    "pipeline.forecast",
    "planning.read",
    "campaign.write",
    "pipeline.discount",
  ],
  senior_delivery_manager: [
    "delivery.read",
    "delivery.write",
    "account.read",
    "pipeline.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
    "account.write",
    "planning.read",
    "strategy.read",
  ],
  senior_presales: [
    "account.read",
    "account.write",
    "pipeline.read",
    "delivery.read",
    "copilot.use",
    "catalog.read",
    "account.record",
    "catalog.write",
    "strategy.read",
    "copilot.decide",
  ],
  marketing_specialist: [
    "campaign.read",
    "campaign.write",
    "signal.read",
    "account.read",
    "catalog.read",
    "copilot.use",
  ],
  sales_ops_specialist: [
    "planning.read",
    "pipeline.read",
    "pipeline.forecast",
    "strategy.read",
    "account.read",
    "campaign.read",
    "catalog.read",
    "copilot.use",
  ],
  key_account_manager: [
    "account.read",
    "account.write",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
    "pipeline.forecast",
    "planning.read",
    "strategy.read",
  ],
  sdr: [
    "signal.read",
    "signal.triage",
    "account.read",
    "account.write",
    "account.record",
    "pipeline.read",
    "campaign.read",
    "catalog.read",
    "copilot.use",
  ],
  deal_desk: [
    "pipeline.read",
    "pipeline.discount",
    "catalog.read",
    "catalog.price",
    "account.read",
    "copilot.use",
  ],
  customer_success: [
    "account.read",
    "account.write",
    "account.record",
    "delivery.read",
    "delivery.write",
    "pipeline.read",
    "signal.read",
    "catalog.read",
    "copilot.use",
    "copilot.decide",
  ],
};

/**
 * Default product role for a platform workspace:owner on first login. This is an
 * INITIALIZATION default only (catalog doc, "relation to platform roles"); it is
 * freely reassignable afterwards and is never re-applied on later logins.
 */
export const OWNER_BOOTSTRAP_ROLE: RoleCode = "sales_leader";

/**
 * The name each preset carries in the table, mirrored from incr/0046 the way
 * ROLE_PERMISSIONS mirrors the grants - catalog.test.ts parses the increment
 * and holds the two in lockstep.
 *
 * SINCE 0046 A ROLE IS THE WORKSPACE'S OWN ROW (角色管理: 有系统预置角色，可以
 * 自定义), and the nine here are the PRESETS a workspace is materialised from
 * on its first sighting and reset to on request. The name is data because the
 * workspace copy prints its own `name` column - a tenant who renames 销售经理
 * sees their word - so the copy has to start from the word the product shows.
 */
export const PRESET_ROLE_NAMES: Record<RoleCode, string> = {
  sales_leader: "销售负责人",
  executive: "高管",
  finance: "财务",
  workspace_admin: "系统管理员",
  viewer: "只读成员",
  sales_rep: "销售代表",
  sales_manager: "销售经理",
  senior_sales_manager: "高级销售经理",
  regional_director: "大区总监",
  regional_general_manager: "大区总经理",
  channel_manager: "渠道经理",
  senior_channel_manager: "高级渠道经理",
  delivery_manager: "交付经理",
  senior_delivery_manager: "高级交付经理",
  presales: "售前顾问",
  senior_presales: "高级售前顾问",
  marketing_specialist: "市场专员",
  marketing_manager: "市场经理",
  sales_ops_specialist: "销售运营专员",
  sales_ops: "销售运营经理",
  key_account_manager: "大客户经理",
  sdr: "商机开发代表",
  deal_desk: "商务专员",
  customer_success: "客户成功经理",
};

/** One sentence on what each preset is FOR, mirrored from incr/0046 like the
 *  names: the roster prints it beside the permission count (owner,
 *  2026-09-09: 给出最简单的角色描述，给出权限数量). */
export const PRESET_ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  sales_leader: "统管销售全链路：审批计划、签批折扣、开启自动执行、管理配置。",
  executive: "看全局、审批计划、裁决助手建议；不编辑业务数据。",
  finance: "看回款、商机与价目，管底价并签批折扣。",
  workspace_admin: "配置工作区：成员、角色与各类目录；不碰业务数据。",
  viewer: "各模块只读，可向助手提问。",
  sales_rep: "跟进客户与商机，推进阶段；不提交预测。",
  sales_manager: "带团队推进商机，提交预测；不签批折扣。",
  senior_sales_manager: "带团队推进商机，提交预测，签批折扣，看战略。",
  regional_director: "统管一个大区的规划与商机，可签批折扣。",
  regional_general_manager: "经营一个大区：战略、规划、活动、商机与交付全链路。",
  channel_manager: "经营渠道伙伴与联合商机；不处置信号。",
  senior_channel_manager: "经营渠道体系：提交预测、编辑渠道活动、签批渠道折扣。",
  delivery_manager: "管理交付项目、里程碑与回款；客户与商机只读。",
  senior_delivery_manager: "统管交付：维护客户主数据，看规划与战略。",
  presales: "配合方案与客户资料；商机与项目只读。",
  senior_presales: "统管方案：维护方案目录，看战略，裁决助手建议。",
  marketing_specialist: "执行活动，看信号；不做处置。",
  marketing_manager: "负责战役与信号处置，直到线索交接；不改商机。",
  sales_ops_specialist: "看规划与预测口径，提交预测汇总；不改口径。",
  sales_ops: "定口径、管配额与角色、设底价、签批折扣；不改商机。",
  key_account_manager: "经营少数重点客户，可提交预测，看规划与战略。",
  sdr: "处置信号、开发线索，交给销售；不推进商机。",
  deal_desk: "审核报价与折扣，管底价。",
  customer_success: "签约后经营客户：跟进交付、续约与新需求。",
};

/**
 * The two shipped grouping vocabularies (incr/0047, owner: 增加两个分组字段，
 * 一个按业务，一个按层级; 数据库不要写死，支持自定义): which business line a
 * role serves, and which rung it stands on. TABLES, per workspace, the
 * shape 行业分类 has (0040) - these lists are what a workspace is seeded with
 * on its first sighting and what 0047 seeded into the workspaces that were
 * already there; the tenant adds, renames and re-orders from there. A preset
 * names its line and rung by CODE into these lists; a workspace role relates
 * to its workspace's rows by id.
 */
export const DEFAULT_ROLE_LINES: readonly { readonly code: string; readonly name: string }[] = [
  { code: "group", name: "集团与通用" },
  { code: "sales", name: "销售" },
  { code: "channel", name: "渠道" },
  { code: "delivery", name: "交付" },
  { code: "presales", name: "售前" },
  { code: "marketing", name: "市场" },
  { code: "ops", name: "运营" },
  { code: "account", name: "客户与商机开发" },
];
export const DEFAULT_ROLE_RANKS: readonly { readonly code: string; readonly name: string }[] = [
  { code: "staff", name: "专员 / 代表" },
  { code: "manager", name: "经理" },
  { code: "senior", name: "高级经理" },
  { code: "director", name: "总监" },
  { code: "general_manager", name: "总经理" },
  { code: "executive", name: "高管" },
];
/** The codes the presets use - the shipped lists', so the mirror types them. */
export type RoleLine = "group" | "sales" | "channel" | "delivery" | "presales" | "marketing" | "ops" | "account";
export type RoleRank = "staff" | "manager" | "senior" | "director" | "general_manager" | "executive";
/** A vocabulary code's shape - chk_role_line_code / chk_role_rank_code. */
export const GROUP_CODE_SHAPE = /^[a-z][a-z0-9_]{0,31}$/;

export const PRESET_ROLE_LINES: Record<RoleCode, RoleLine> = {
  sales_leader: "group",
  executive: "group",
  finance: "group",
  workspace_admin: "group",
  viewer: "group",
  sales_rep: "sales",
  sales_manager: "sales",
  senior_sales_manager: "sales",
  regional_director: "sales",
  regional_general_manager: "sales",
  channel_manager: "channel",
  senior_channel_manager: "channel",
  delivery_manager: "delivery",
  senior_delivery_manager: "delivery",
  presales: "presales",
  senior_presales: "presales",
  marketing_specialist: "marketing",
  marketing_manager: "marketing",
  sales_ops_specialist: "ops",
  sales_ops: "ops",
  key_account_manager: "account",
  sdr: "account",
  deal_desk: "account",
  customer_success: "account",
};

export const PRESET_ROLE_RANKS: Record<RoleCode, RoleRank> = {
  sales_leader: "executive",
  executive: "executive",
  finance: "staff",
  workspace_admin: "staff",
  viewer: "staff",
  sales_rep: "staff",
  sales_manager: "manager",
  senior_sales_manager: "senior",
  regional_director: "director",
  regional_general_manager: "general_manager",
  channel_manager: "manager",
  senior_channel_manager: "senior",
  delivery_manager: "manager",
  senior_delivery_manager: "senior",
  presales: "staff",
  senior_presales: "senior",
  marketing_specialist: "staff",
  marketing_manager: "manager",
  sales_ops_specialist: "staff",
  sales_ops: "manager",
  key_account_manager: "manager",
  sdr: "staff",
  deal_desk: "staff",
  customer_success: "manager",
};

/** The roster order the seed fixes (0048, owner: 预置角色排序固化): business
 *  line first, in the shipped 业务线 order, then rank from the top rung down
 *  inside each line. NOT the seed order, which appends. */
export const PRESET_ROLE_ORDER: readonly RoleCode[] = [
  "sales_leader",
  "executive",
  "finance",
  "workspace_admin",
  "viewer",
  "regional_general_manager",
  "regional_director",
  "senior_sales_manager",
  "sales_manager",
  "sales_rep",
  "senior_channel_manager",
  "channel_manager",
  "senior_delivery_manager",
  "delivery_manager",
  "senior_presales",
  "presales",
  "marketing_manager",
  "marketing_specialist",
  "sales_ops",
  "sales_ops_specialist",
  "key_account_manager",
  "customer_success",
  "sdr",
  "deal_desk",
];

/** A workspace role's code: the shape chk_workspace_role_code CHECKs (0046).
 *  Lower-case identifier, like the nine seeded ones, at most 64 characters. */
export const ROLE_CODE_SHAPE = /^[a-z][a-z0-9_]{0,63}$/;

/** One preset, the way the in-memory store materialises it - code, name,
 *  order and grants, in catalogue order. The Prisma store reads the same rows
 *  from local_authz.role. */
export interface PresetRole {
  readonly code: RoleCode;
  readonly name: string;
  readonly description: string;
  readonly line: RoleLine;
  readonly rank: RoleRank;
  readonly sortOrder: number;
  readonly permissions: readonly PermCode[];
}

export function presetRoles(): PresetRole[] {
  return PRESET_ROLE_ORDER.map((code, i) => ({
    code,
    name: PRESET_ROLE_NAMES[code],
    description: PRESET_ROLE_DESCRIPTIONS[code],
    line: PRESET_ROLE_LINES[code],
    rank: PRESET_ROLE_RANKS[code],
    sortOrder: i + 1,
    permissions: ROLE_PERMISSIONS[code],
  }));
}

const PERM_SET: ReadonlySet<string> = new Set(PERM_CODES);
const ROLE_SET: ReadonlySet<string> = new Set(ROLE_CODES);

export function isPermCode(value: string): value is PermCode {
  return PERM_SET.has(value);
}

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_SET.has(value);
}

/**
 * Union of the permissions held by a set of roles. Unknown role codes are
 * ignored rather than throwing: the database catalog can legitimately be ahead
 * of this mirror during a rolling deploy, and an unknown role must degrade to
 * "grants nothing", never to "grants everything".
 */
export function permissionsForRoles(roles: readonly string[]): PermCode[] {
  const out = new Set<PermCode>();
  for (const role of roles) {
    if (!isRoleCode(role)) continue;
    for (const perm of ROLE_PERMISSIONS[role]) out.add(perm);
  }
  // Stable catalog order, so callers can compare/serialize without sorting.
  return PERM_CODES.filter((p) => out.has(p));
}
