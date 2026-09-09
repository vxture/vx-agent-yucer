"use client";

import type { RoleGroupView } from "../../authz/roles";
import type { RoleGroupKind } from "../../authz/store";
import { useMessages } from "../lib/i18n/provider";
import {
  moveRoleGroupAction,
  removeRoleGroupAction,
  saveRoleGroupAction,
} from "../admin/roles/actions";
import { VocabularyConfig } from "./vocabulary-config";

/* 角色分组 - 业务线 and 层级, the workspace's own lists (incr/0047; owner:
 * 数据库不要写死，支持自定义，参考区域设置).
 *
 * TWO VOCABULARIES, ONE SCREEN, the shape 产品配置 has: each is an anchor
 * code, a name, an order and a count of the roles standing in it, and a
 * delete refused while any does - which is exactly what VocabularyConfig
 * draws. The shipped eight lines and six rungs are a starting point; a
 * group with a 政企 line or a 副总裁 rung adds its own here and every role
 * form offers it from then on.
 */
export function RoleGroupsConfig({ kind, rows }: {
  readonly kind: RoleGroupKind;
  readonly rows: readonly RoleGroupView[];
}) {
  const { ROLE_GROUP_ERROR, ROLE_GROUP_TEXT } = useMessages();
  const T = ROLE_GROUP_TEXT[kind];
  return (
    <VocabularyConfig
      rows={rows}
      idPrefix={kind}
      errors={ROLE_GROUP_ERROR}
      text={{
        title: T.title,
        noun: T.colName,
        why: T.why,
        add: T.add,
        save: ROLE_GROUP_TEXT.save,
        codeLabel: T.code,
        codeHint: ROLE_GROUP_TEXT.codeHint,
        nameLabel: T.name,
        colName: T.colName,
        deleteConsequence: T.deleteConsequence,
      }}
      columns={[
        {
          id: "roles",
          sortable: true,
          header: ROLE_GROUP_TEXT.colRoles,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{r.roles}</span>,
        },
      ]}
      sortOn={{ roles: (r) => r.roles }}
      deletableWhen={(r) => r.roles === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => saveRoleGroupAction(kind, { code: input.code, name: input.name })}
      onMove={(id, direction) => moveRoleGroupAction(kind, id, direction)}
      onDelete={(id) => removeRoleGroupAction(kind, id)}
    />
  );
}
