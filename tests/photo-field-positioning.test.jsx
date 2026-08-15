import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: vi.fn().mockResolvedValue(null),
}))

import PhotoField from '../src/components/PhotoField.jsx'

// The positioning half of PhotoField — the player form's photo control.
//
// ⚠️ THE PROPERTY UNDER TEST IS THAT NOTHING SAVES ITSELF. PhotoField has never
// owned what it shows: `file`, `removed` and now `focus` are all the
// surrounding form's state, because the form decides when any of it reaches the
// database. That is what stops an abandoned form leaving an orphaned photograph
// of a child in the bucket, and a focal point that wrote itself immediately
// would break it for no gain.

const PLAYER = { id: 'p1', full_name: 'Amir Haddad', photo_path: null }

describe('PhotoField — positioning', () => {
  it('offers a drop zone naming the player when there is no photo', () => {
    render(<PhotoField player={PLAYER} file={null} removed={false} onFileChange={vi.fn()} />)

    expect(screen.getByLabelText(/Add a photo for Amir Haddad/i)).toBeInTheDocument()
    expect(screen.queryByTestId('player-photo-positioner')).not.toBeInTheDocument()
  })

  // ⚠️ THE "Add photo" BUTTON STAYS HERE, unlike the staff card. That card had
  // no other control, so its button and drop zone were duplicates by name; this
  // one sits in a form beside Change/Remove, whose labels differ.
  it('keeps the button as well as the drop zone', () => {
    render(<PhotoField player={PLAYER} file={null} removed={false} onFileChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^Add photo$/ })).toBeInTheDocument()
  })

  it('hands a dropped file to the form rather than uploading it', () => {
    const onFileChange = vi.fn()
    render(<PhotoField player={PLAYER} file={null} removed={false} onFileChange={onFileChange} />)

    const file = new File(['x'], 'face.jpg', { type: 'image/jpeg' })
    fireEvent.drop(screen.getByTestId('photo-drop-zone'), { dataTransfer: { files: [file] } })

    expect(onFileChange).toHaveBeenCalledWith(file)
  })

  it('shows the positioner once a file is chosen, and reports moves upward', () => {
    const onFocusChange = vi.fn()
    render(
      <PhotoField
        player={PLAYER}
        file={new File(['x'], 'face.jpg', { type: 'image/jpeg' })}
        removed={false}
        onFileChange={vi.fn()}
        focus={{ x: 50, y: 50 }}
        onFocusChange={onFocusChange}
      />,
    )

    expect(screen.getByTestId('player-photo-positioner')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByTestId('photo-stage'), { key: 'ArrowRight' })
    expect(onFocusChange).toHaveBeenCalledWith({ x: 52, y: 50 })
  })

  // ⚠️ WITHOUT `onFocusChange` THERE IS NO POSITIONER. A caller that has not
  // opted in gets the old behaviour exactly, rather than a control whose moves
  // go nowhere — which would look like it worked and then lose the position.
  it('renders no positioner when the caller has not opted in', () => {
    render(
      <PhotoField
        player={PLAYER}
        file={new File(['x'], 'face.jpg', { type: 'image/jpeg' })}
        removed={false}
        onFileChange={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('player-photo-positioner')).not.toBeInTheDocument()
  })
})
