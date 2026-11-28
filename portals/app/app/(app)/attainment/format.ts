/** Fixed table scale keeps decimal alignment; exact source amounts remain in tooltips. */
export function moneyScale(locale: string, currency: string) {
  return locale.startsWith("zh")
    ? { divisor: 10000, label: `${currency} \u00b7 \u4e07` }
    : { divisor: 1000, label: `${currency} \u00b7 k` };
}
