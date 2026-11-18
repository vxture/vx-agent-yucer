/** Serialize this read-only DOM inspection into a dedicated review tab. */
export function inspectPageControls() {
  const visible = (e) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const compactBuiltIns = [
    'th button:not([role="checkbox"]):not([data-slot]):not([data-control-kind])',
    'td button[aria-expanded][class~="size-control-xs"]',
    '[role="dialog"] button[class~="size-control-md"]:not([data-slot])',
    '[role="dialog"]>button:has(>.sr-only):has(>svg):not([data-slot])',
    '[role="tab"]',
  ].join(",");
  const selector = [
    '[data-slot="button"]', '[data-slot="input"]', '[data-slot="native-select"]',
    '[data-slot="input-group"]', '[role="combobox"]', '[role="tablist"]',
    '[role="radiogroup"]:has(>button[role="radio"]:not([data-state]))',
    'button[aria-pressed]:not([data-slot])',
    'button[role="radio"]:is([data-state="on"],[data-state="off"])',
    '[data-control-size="regular"]', '[data-control-size="compact"]', compactBuiltIns,
    '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]', '[role="option"]',
  ].join(",");
  const controls = [...document.querySelectorAll(selector)].filter(visible).map((e) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    const preserve = !!e.closest('[data-control-size="preserve"]');
    const compact = e.dataset.controlSize === "compact" || e.matches(compactBuiltIns);
    const menu = ["menuitem", "menuitemcheckbox", "menuitemradio", "option"].includes(e.getAttribute("role"));
    const primary = e.dataset.controlEmphasis === "primary" || e.dataset.slot === "button" && e.dataset.variant === "default" && (e.dataset.size === "xl" || e.type === "submit");
    const formValue = !!e.closest('[data-business-form], [data-business-fields]') && e.matches(
      '[data-slot="input"], [data-slot="native-select"], [data-slot="input-group-input"], [data-slot="textarea"], [data-form-value], [data-slot="field"] [role="combobox"]',
    );
    const target = compact ? 24 : 32, font = primary || formValue ? 14 : 12;
    const labelFonts = [...e.querySelectorAll('[class~="text-label"]')].filter(visible).map(label => getComputedStyle(label).fontSize);
    const actionSlot = e.closest("[data-page-action-slot]")?.dataset.pageActionSlot;
    const variant = e.dataset.variant;
    const issues = preserve ? [] : [
      ...((menu ? r.height < target - 0.6 : Math.abs(r.height - target) > 0.6) ? ["height"] : []),
      ...(labelFonts.some(value => Math.abs(parseFloat(value) - font) > 0.1) ? ["label-font"] : []),
      ...(Math.abs(parseFloat(s.fontSize) - font) > 0.1 ? ["font"] : []),
      ...(e.dataset.size?.startsWith("icon-") && Math.abs(r.width - target) > 0.6 ? ["icon-width"] : []),
      ...(e.dataset.slot === "button" && actionSlot === "primary" && (!primary || variant !== "default") ? ["page-primary-style"] : []),
      ...(e.dataset.slot === "button" && actionSlot === "secondary" && (primary || variant !== "outline") ? ["page-secondary-style"] : []),
      ...(actionSlot === "more" && e.matches('button[aria-haspopup="menu"]') &&
        Math.abs((e.querySelector("svg")?.getBoundingClientRect().width ?? 0) - 20) > 0.6 ? ["page-more-icon"] : []),
    ];
    return {
      slot: e.dataset.slot ?? e.getAttribute("role") ?? e.dataset.controlKind,
      text: (e.textContent || e.getAttribute("aria-label") || e.getAttribute("placeholder") || "").trim().slice(0, 90),
      h: r.height, w: r.width, font: s.fontSize, preserve, compact, primary, formValue, labelFonts, actionSlot, variant, issues,
    };
  });
  const native = [...document.querySelectorAll('button:not([data-slot]):not([data-control-kind])')].filter(visible).map((e) => ({
    role: e.getAttribute("role"), text: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 70),
    cls: String(e.className).slice(0, 150), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width,
    font: getComputedStyle(e).fontSize,
  }));
  return {
    url: location.href, title: document.title, controls, native,
    violations: controls.filter((c) => c.issues.length), body: document.body.innerText.slice(0, 180),
    links: [...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith(location.origin)),
  };
}

export const inspectionExpression = `(${inspectPageControls.toString()})()`;
