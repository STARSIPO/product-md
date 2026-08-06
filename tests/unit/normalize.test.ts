import { describe, expect, it } from 'vitest'
import { editDistance, isFuzzyMatch, normalize, slugify, stem, tokenize } from '@/lib/normalize'

describe('normalize', () => {
  it('folds Romanian diacritics, including the cedilla variants', () => {
    expect(normalize('Carne de vită')).toBe('carne de vita')
    expect(normalize('Chișinău')).toBe('chisinau')
    // U+015F / U+0163 are what older Windows keyboards emit; they must fold the same.
    expect(normalize('Şoldăneşti')).toBe(normalize('Șoldănești'))
    expect(normalize('brânză')).toBe('branza')
  })

  it('keeps Cyrillic as Cyrillic', () => {
    expect(normalize('Говядина')).toBe('говядина')
    expect(normalize('ЁЛКА')).toBe('елка')
  })

  it('collapses punctuation and whitespace', () => {
    expect(normalize('  Мясо,   охлаждённое!!! ')).toBe('мясо охлажденное')
    expect(normalize('cutii  pentru   pizza')).toBe('cutii pentru pizza')
  })

  it('stems inflected forms onto a shared token', () => {
    expect(stem('помидоры')).toBe(stem('помидорам'))
    expect(stem('картофеля')).toBe(stem('картофель').slice(0, stem('картофеля').length))
    expect(stem('кг')).toBe('кг')
  })

  it('tokenizes into searchable words', () => {
    expect(tokenize('20 кг охлаждённой говядины')).toEqual([
      '20',
      'кг',
      'охлажденнои',
      'говядины',
    ])
    expect(tokenize('   ')).toEqual([])
  })

  describe('typo tolerance', () => {
    it('measures edit distance with an early exit', () => {
      expect(editDistance('говядина', 'говядина')).toBe(0)
      expect(editDistance('говядина', 'гавядина')).toBe(1)
      expect(editDistance('помидор', 'памидор')).toBe(1)
      // Beyond the cap the function bails out rather than filling the matrix.
      expect(editDistance('говядина', 'упаковка', 3)).toBeGreaterThan(3)
    })

    it('scales tolerance with word length', () => {
      expect(isFuzzyMatch('говядина', 'гавядина')).toBe(true)
      expect(isFuzzyMatch('cartofi', 'cartof')).toBe(true)
      // A short word gets almost no slack, so unrelated short words do not collide.
      expect(isFuzzyMatch('мед', 'лес')).toBe(false)
    })
  })

  it('produces readable latin slugs from Cyrillic', () => {
    expect(slugify('Говядина охлаждённая')).toBe('govyadina-ohlazhdennaya')
    expect(slugify('Carne de vită')).toBe('carne-de-vita')
    expect(slugify('!!!')).toBe('item')
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(70)
  })
})
