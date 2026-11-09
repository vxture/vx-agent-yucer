/** Short names belong on the trigger; expanded identity retains the full name. */
export function organizationLabels(
  fullName: string | null,
  displayName: string | null,
  unknownLabel: string,
): { trigger: string; panel: string } {
  const full = fullName?.trim();
  const short = displayName?.trim();
  return {
    trigger: short || full || unknownLabel,
    panel: full || short || unknownLabel,
  };
}
