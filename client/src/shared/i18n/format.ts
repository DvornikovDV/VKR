export type RuPluralForms = readonly [one: string, few: string, many: string]

export function selectRuPluralForm(count: number, forms: RuPluralForms): string {
  const absoluteCount = Math.abs(Math.trunc(count))
  const lastTwoDigits = absoluteCount % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return forms[2]
  }

  const lastDigit = absoluteCount % 10

  if (lastDigit === 1) {
    return forms[0]
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return forms[1]
  }

  return forms[2]
}

export function formatRuCount(count: number, forms: RuPluralForms): string {
  return `${count} ${selectRuPluralForm(count, forms)}`
}
