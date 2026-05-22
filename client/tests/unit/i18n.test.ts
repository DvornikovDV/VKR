import { describe, expect, it } from 'vitest'

import { formatRuCount, ruUiText, selectRuPluralForm } from '@/shared/i18n'

describe('Russian UI text helpers', () => {
  it('selects Russian plural forms for common UI counters', () => {
    const forms = ruUiText.nouns.diagram

    expect(selectRuPluralForm(1, forms)).toBe('мнемосхема')
    expect(selectRuPluralForm(2, forms)).toBe('мнемосхемы')
    expect(selectRuPluralForm(5, forms)).toBe('мнемосхем')
    expect(selectRuPluralForm(11, forms)).toBe('мнемосхем')
    expect(selectRuPluralForm(21, forms)).toBe('мнемосхема')
    expect(selectRuPluralForm(24, forms)).toBe('мнемосхемы')
  })

  it('formats signed and fractional counts predictably for display', () => {
    expect(formatRuCount(-1, ruUiText.nouns.edgeObject)).toBe('-1 объект')
    expect(formatRuCount(2.7, ruUiText.nouns.edgeObject)).toBe('2.7 объекта')
  })
})
