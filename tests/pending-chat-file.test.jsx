import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePendingChatFile } from '../src/lib/usePendingChatFile.js'

const pdf = () => new File(['x'], 'notes.pdf', { type: 'application/pdf' })
const ppt = () => new File(['x'], 'slides.ppt', { type: 'application/vnd.ms-powerpoint' })
const xlsx = () =>
  new File(['x'], 'grid.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

describe('usePendingChatFile', () => {
  it('holds one allowlisted file', () => {
    const { result } = renderHook(() => usePendingChatFile())
    act(() => result.current.pick([pdf()]))
    expect(result.current.file?.name).toBe('notes.pdf')
    expect(result.current.error).toBeNull()
  })

  it('refuses ppt and keeps empty', () => {
    const { result } = renderHook(() => usePendingChatFile())
    act(() => result.current.pick([ppt()]))
    expect(result.current.file).toBeNull()
    expect(result.current.error).toMatch(/not supported/i)
  })

  it('replaces rather than stacking — one file per send', () => {
    const { result } = renderHook(() => usePendingChatFile())
    act(() => result.current.pick([pdf()]))
    act(() => result.current.pick([xlsx()]))
    expect(result.current.file?.name).toBe('grid.xlsx')
  })
})
