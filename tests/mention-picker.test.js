import { describe, it, expect } from 'vitest'
import { appendMention, mentionQueryAt } from '../src/components/MentionPicker.jsx'

// Typeahead (Jay, 5 Sep 2026): the @ list opens from a typed @, not a
// permanent button. Replacing the in-progress token is the same picker the
// button used — appendMention still writes `@Full Name ` and the ids still
// ride draftMentions.

describe('mentionQueryAt', () => {
  it('finds an @ token at the caret after whitespace or at the start', () => {
    expect(mentionQueryAt('@', 1)).toEqual({ query: '', start: 0 })
    expect(mentionQueryAt('hi @Mi', 6)).toEqual({ query: 'Mi', start: 3 })
  })

  it('is silent in a 1:1-style draft with no @, and inside a word', () => {
    expect(mentionQueryAt('hello', 5)).toBeNull()
    expect(mentionQueryAt('a@b', 3)).toBeNull()
    expect(mentionQueryAt('@Mira Vantel ', 13)).toBeNull()
  })
})

describe('appendMention', () => {
  it('appends at the end when nothing is being typed (the old button path)', () => {
    expect(appendMention('', { full_name: 'Mira Vantel' })).toBe('@Mira Vantel ')
    expect(appendMention('hi', { full_name: 'Mira Vantel' })).toBe('hi @Mira Vantel ')
  })

  it('replaces the in-progress @query at the caret', () => {
    expect(appendMention('hi @Mi', { full_name: 'Mira Vantel' }, 6)).toBe('hi @Mira Vantel ')
    expect(appendMention('@', { full_name: 'Tomas Orrin' }, 1)).toBe('@Tomas Orrin ')
  })
})
