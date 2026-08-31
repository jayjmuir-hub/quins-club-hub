import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Unit tests for src/components/DocumentUploadSheet.jsx: who may target a
// document at which squads, the staff-only/notify defaults, and that a bad
// file is caught before any network call. `uploadDocument` is mocked, so
// this exercises only the component's own behaviour — never a real upload.
// Mirrors tests/notice-composer.test.jsx's shape (task-5-brief.md).

const uploadDocumentMock = vi.fn().mockResolvedValue('doc-1')
vi.mock('../src/data/documents.js', () => ({
  uploadDocument: (...args) => uploadDocumentMock(...args),
}))

import DocumentUploadSheet from '../src/components/DocumentUploadSheet.jsx'

const TEAMS = [{ id: 't1', name: 'U12' }, { id: 't2', name: 'U14' }]
const coach = [{ role: 'coach', team_id: 't1', status: 'active' }]
const admin = [{ role: 'admin', team_id: null, status: 'active' }]

function pdf(name = 'pack.pdf') {
  return new File(['x'], name, { type: 'application/pdf' })
}

beforeEach(() => uploadDocumentMock.mockClear())

describe('DocumentUploadSheet', () => {
  it('defaults the tier to staff-only', () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} />)
    expect(screen.getByLabelText(/staff only/i)).toBeChecked()
  })

  it('hides the whole-club switch from non-admins and shows only staffed squads', () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} />)
    expect(screen.queryByLabelText(/whole club/i)).toBeNull()
    expect(screen.getByLabelText('U12')).toBeInTheDocument()
    expect(screen.queryByLabelText('U14')).toBeNull()
  })

  it('blocks submit with nothing targeted rather than widening', async () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={admin} />)
    fireEvent.change(screen.getByLabelText(/file/i),
      { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: /add document/i }))
    expect(uploadDocumentMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/at least one age group/i)).toBeInTheDocument()
  })

  it('rejects a bad file type inline, before any upload', async () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} />)
    const bad = new File(['x'], 'movie.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText(/file/i),
      { target: { files: [bad] } })
    expect(await screen.findByText(/not supported/i)).toBeInTheDocument()
  })

  it('submits with the coach squad targeted and notify off by default', async () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} onUploaded={() => {}} />)
    fireEvent.change(screen.getByLabelText(/file/i),
      { target: { files: [pdf()] } })
    fireEvent.change(screen.getByLabelText(/title/i),
      { target: { value: 'Festival pack' } })
    fireEvent.click(screen.getByRole('button', { name: /add document/i }))
    await waitFor(() => expect(uploadDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Festival pack', staffOnly: true,
        clubWide: false, teamIds: ['t1'], prefixTeamId: 't1',
        notify: false })))
  })
})
