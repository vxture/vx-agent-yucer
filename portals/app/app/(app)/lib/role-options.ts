import { ACTIONS } from "../../authz/actions";
import { PERM_CODES } from "../../authz/catalog";
import type { PermissionOption } from "../components/role-form";

/**
 * The permission catalogue as the role form offers it: every code, its copy,
 * the module it belongs to, and how many operations in the action catalogue
 * need it. READ OFF THE MIRRORS, never typed in - the count is what tells a
 * reader that `pipeline.write` is eleven buttons and `copilot.autopilot` one.
 */
export function permissionOptions(
  label: Record<string, string>,
  moduleLabel: Record<string, string>,
): PermissionOption[] {
  const unlocks = new Map<string, number>();
  for (const spec of Object.values(ACTIONS)) {
    unlocks.set(spec.permission, (unlocks.get(spec.permission) ?? 0) + 1);
  }
  return PERM_CODES.map((code) => {
    const module = code.split(".")[0]!;
    return {
      code,
      label: label[code] ?? code,
      module,
      moduleLabel: moduleLabel[module] ?? module,
      unlocks: unlocks.get(code) ?? 0,
    };
  });
}
