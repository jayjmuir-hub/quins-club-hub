import {
  FIELD,
  OVER_FILL,
  SPARE_FILL,
  BRAND,
  INK,
  MUTED,
  LINE,
  WHITE,
  FONT_STACK,
  statusChipColours,
  segLabel,
  SAVED_NOTE_BG,
  SAVED_NOTE_TEXT,
  FOOTER_TEXT,
  HEADER_TEXT,
  WEEK_LEGEND_TEXT,
} from './pitchShareStyle.js'

// The pitch-layout picture, drawn NATIVELY on a <canvas> for the shared PNG.
//
// ⚠️ WHY THIS EXISTS AND html2canvas DOES NOT DRAW IT — Jay, 30 Aug 2026.
// html2canvas re-implements a text renderer and mangles small text: the white
// squad codes came out as a row of dashes in the exported PNG while the live DOM
// card looked perfect. A <canvas> uses the browser's own text engine, so it stays
// crisp at any size and any scale. The on-screen card (src/components/
// PitchShareCard.jsx) still renders the SAME layout in the DOM; both read the same
// numbers (pitchOccupancy) and the same palette/label rules (pitchShareStyle), so
// the picture you send matches the picture you see.
//
// ⚠️ DRAWN AT DPR×, THEN HANDED OVER AS A CANVAS. src/lib/shareImage.js turns the
// returned canvas into the PNG; this file only draws. A cursor pattern runs the
// exact same code to MEASURE (draw=false) and to PAINT (draw=true), so the height
// the canvas is sized to can never disagree with the height actually drawn.

// 3× so the codes stay legible after WhatsApp re-compresses the PNG — the same
// reason the old html2canvas call used scale: 2, only more of it because native
// text can take it without the fuzz html2canvas added.
const DPR = 3
const EPS = 1e-9

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${FONT_STACK}`
}

/** Truncate `text` with an ellipsis so it fits `maxW` px in the ctx's current
 *  font — the pixel-accurate clip the DOM did with overflow:hidden. */
function fit(ctx, text, maxW) {
  if (maxW <= 0) return ''
  const s = String(text ?? '')
  if (ctx.measureText(s).width <= maxW) return s
  let cut = s
  while (cut.length && ctx.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1)
  return cut ? `${cut.trimEnd()}…` : ''
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

// ── One pitch bar ────────────────────────────────────────────────────────────
// Returns the height it consumes; paints only when `draw`.

function drawSegments(ctx, x, y, w, h, bar, compact) {
  const load = bar.segments.reduce((sum, seg) => sum + seg.fraction, 0)
  const scale = Math.max(load, 1)
  const midY = y + h / 2
  const pad = compact ? 2 : 6

  ctx.save()
  roundRectPath(ctx, x, y, w, h, 6)
  ctx.clip()

  const boundaries = []
  let sx = x
  bar.segments.forEach((seg, i) => {
    const sw = (seg.fraction / scale) * w
    ctx.fillStyle = bar.over ? OVER_FILL : FIELD[i % FIELD.length]
    ctx.fillRect(sx, y, Math.ceil(sw) + 0.5, h)

    const label = segLabel(seg, compact)
    const cx = sx + sw / 2
    ctx.textAlign = 'center'
    if (compact) {
      setFont(ctx, 800, 11)
      ctx.fillStyle = WHITE
      ctx.fillText(fit(ctx, label, sw - pad * 2), cx, midY + 4)
    } else {
      setFont(ctx, 800, 13)
      ctx.fillStyle = WHITE
      ctx.fillText(fit(ctx, label, sw - pad * 2), cx, midY - 2)
      setFont(ctx, 700, 11)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText(fit(ctx, seg.portionShort, sw - pad * 2), cx, midY + 13)
    }
    sx += sw
    if (i < bar.segments.length - 1 || bar.spareFraction > EPS) boundaries.push(sx)
  })

  if (bar.spareFraction > EPS) {
    const sw = (bar.spareFraction / scale) * w
    ctx.fillStyle = SPARE_FILL
    ctx.fillRect(sx, y, Math.ceil(sw) + 0.5, h)
    setFont(ctx, 700, compact ? 11 : 11.5)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText(fit(ctx, compact ? 'spare' : 'Spare', sw - 8), sx + sw / 2, midY + 4)
  }

  // The white gaps the DOM drew as per-segment right borders.
  ctx.strokeStyle = WHITE
  ctx.lineWidth = compact ? 1 : 1.5
  boundaries.forEach((bx) => {
    ctx.beginPath()
    ctx.moveTo(bx, y)
    ctx.lineTo(bx, y + h)
    ctx.stroke()
  })
  ctx.restore()

  // The DOM's white 1.5px border plus a 1px LINE box-shadow around the bar.
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x, y, w, h, 6)
  ctx.stroke()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  roundRectPath(ctx, x - 0.75, y - 0.75, w + 1.5, h + 1.5, 6)
  ctx.stroke()
}

function drawChip(ctx, rightX, topY, bar, draw) {
  const text = `${bar.over ? '⚠ ' : ''}${bar.statusText}`
  setFont(ctx, 800, 11.5)
  const tw = ctx.measureText(text).width
  const chipW = tw + 16
  const chipH = 19
  if (draw) {
    const { bg, fg } = statusChipColours({ over: bar.over, spareFraction: bar.spareFraction })
    ctx.fillStyle = bg
    roundRectPath(ctx, rightX - chipW, topY, chipW, chipH, chipH / 2)
    ctx.fill()
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    setFont(ctx, 800, 11.5)
    ctx.fillText(text, rightX - chipW / 2, topY + 13.5)
  }
  return chipH
}

/** A full (day) pitch bar: pitch name + status chip, then the 46px bar. */
function fullBar(ctx, x, y, w, bar, draw) {
  const headerH = 20
  if (draw) {
    setFont(ctx, 900, 14)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText(bar.pitch, x, y + 15)
    drawChip(ctx, x + w, y, bar, true)
  }
  const barY = y + headerH + 5
  if (draw) drawSegments(ctx, x, barY, w, 46, bar, false)
  return headerH + 5 + 46 + 12 // trailing marginBottom 12
}

/** A compact (week) pitch bar: a 24px pitch label, then a 30px bar. */
function compactBar(ctx, x, y, w, bar, draw) {
  const labelW = 24
  const gap = 6
  if (draw) {
    setFont(ctx, 900, 11)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText(bar.pitch, x, y + 20)
    drawSegments(ctx, x + labelW + gap, y, w - labelW - gap, 30, bar, true)
  }
  return 30 + 8 // trailing marginBottom 8
}

// ── Shared shell pieces ───────────────────────────────────────────────────────

function drawHeader(ctx, x, y, w, title, draw) {
  if (draw) {
    // Brand dot + "CLUB HUB · Pitch Allocation".
    ctx.fillStyle = BRAND
    ctx.beginPath()
    ctx.arc(x + 6, y + 9, 6, 0, Math.PI * 2)
    ctx.fill()
    setFont(ctx, 800, 13)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText(HEADER_TEXT, x + 20, y + 13)
    // Title, right-aligned.
    ctx.textAlign = 'right'
    ctx.fillText(fit(ctx, title, w * 0.42), x + w, y + 13)
  }
  return 18 + 12 // header row height + marginBottom 12
}

/** The two-line reassurance note (marginTop is added by the caller). */
function drawSavedNote(ctx, x, y, w, draw) {
  const innerW = w - 22
  setFont(ctx, 600, 12)
  // Wrap to the box width.
  const words = SAVED_NOTE_TEXT.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > innerW && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  const lineH = 17
  const boxH = lines.length * lineH + 18
  if (draw) {
    ctx.fillStyle = SAVED_NOTE_BG
    roundRectPath(ctx, x, y, w, boxH, 8)
    ctx.fill()
    ctx.fillStyle = BRAND
    ctx.fillRect(x, y, 3, boxH)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    setFont(ctx, 600, 12)
    lines.forEach((ln, i) => ctx.fillText(ln, x + 11, y + 9 + 12 + i * lineH))
  }
  return boxH
}

function drawFooter(ctx, x, y, w, draw) {
  if (draw) {
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y + 8)
    ctx.lineTo(x + w, y + 8)
    ctx.stroke()
    setFont(ctx, 600, 11)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText(FOOTER_TEXT, x + w / 2, y + 8 + 8 + 11)
  }
  return 8 + 8 + 11 + 4 // marginTop 8 + paddingTop 8 + text + slack
}

/** Size a canvas at DPR×, scale the context to logical px, and paint the white
 *  rounded background + hairline border. */
function makeCard(cssW, cssH) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(cssW * DPR)
  canvas.height = Math.ceil(cssH * DPR)
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = WHITE
  roundRectPath(ctx, 0, 0, cssW, cssH, 16)
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  roundRectPath(ctx, 0.5, 0.5, cssW - 1, cssH - 1, 16)
  ctx.stroke()
  return { canvas, ctx }
}

/** A throwaway context whose only job is measureText during the layout pass. */
function measuringCtx() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 4
  return c.getContext('2d')
}

const PAD_X = 18
const PAD_TOP = 18
const PAD_BOTTOM = 12

/**
 * Draw a DAY card from diagramSlots output and return the HTMLCanvasElement.
 * @param {{ title: string, slots: Array }} model
 */
export function drawPitchDayCanvas({ title, slots }) {
  const width = 680
  const contentW = width - PAD_X * 2

  // A single walk of the body, used first to measure and then to paint.
  function body(ctx, x, y, draw) {
    let cy = y
    for (const slot of slots) {
      cy += 2
      if (draw) {
        setFont(ctx, 800, 12)
        ctx.fillStyle = BRAND
        ctx.textAlign = 'left'
        ctx.fillText(slot.timeLabel, x, cy + 12)
      }
      cy += 12 + 8
      for (const bar of slot.pitches) {
        cy += fullBar(ctx, x, cy, contentW, bar, draw)
      }
      cy += 6
    }
    cy += 14 // marginTop before the saved note
    cy += drawSavedNote(ctx, x, cy, contentW, draw)
    return cy - y
  }

  const measure = measuringCtx()
  const headerH = drawHeader(measure, PAD_X, PAD_TOP, contentW, title, false)
  const bodyH = body(measure, PAD_X, PAD_TOP + headerH, false)
  const footerH = drawFooter(measure, PAD_X, 0, contentW, false)
  const totalH = PAD_TOP + headerH + bodyH + footerH + PAD_BOTTOM

  const { canvas, ctx } = makeCard(width, totalH)
  drawHeader(ctx, PAD_X, PAD_TOP, contentW, title, true)
  body(ctx, PAD_X, PAD_TOP + headerH, true)
  drawFooter(ctx, PAD_X, PAD_TOP + headerH + bodyH, contentW, true)
  return canvas
}

/**
 * Draw a WEEK card from the weekModel (diagramWeek zipped with weekday/dayNum
 * labels) and return the HTMLCanvasElement.
 * @param {{ title: string, days: Array }} model
 */
export function drawPitchWeekCanvas({ title, days }) {
  const width = 1540
  const contentW = width - PAD_X * 2
  const gap = 10
  const colW = (contentW - gap * 6) / 7
  const boxPad = 9
  const boxInnerW = colW - boxPad * 2

  // Natural content height of one day column, inside its padding.
  function columnContentH(ctx, day) {
    const headerBlock = 5 + 12 + 7 // paddingBottom + text + marginBottom
    if (day.empty) return headerBlock + 20 + 18 + 6 // dash paddingTop + glyph + slack
    let h = headerBlock
    for (const slot of day.slots) {
      h += 13 + 6 // time label + marginBottom
      h += slot.pitches.length * (30 + 8)
      h += 8 // slot marginBottom
    }
    return h
  }

  const measure = measuringCtx()
  const maxContentH = days.reduce((m, day) => Math.max(m, columnContentH(measure, day)), 0)
  const boxH = Math.max(150, maxContentH + boxPad * 2)

  function drawColumn(ctx, x, y, day) {
    ctx.save()
    if (day.empty) ctx.globalAlpha = 0.5
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    roundRectPath(ctx, x + 0.5, y + 0.5, colW - 1, boxH - 1, 10)
    ctx.stroke()

    const ix = x + boxPad
    let cy = y + boxPad
    // Header: weekday left, dayNum right, with an underline.
    setFont(ctx, 900, 11)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0.33px'
    ctx.fillText(day.weekday, ix, cy + 11)
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px'
    setFont(ctx, 800, 12)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.fillText(String(day.dayNum), ix + boxInnerW, cy + 11)
    cy += 16
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ix, cy)
    ctx.lineTo(ix + boxInnerW, cy)
    ctx.stroke()
    cy += 7

    if (day.empty) {
      setFont(ctx, 700, 18)
      ctx.fillStyle = MUTED
      ctx.textAlign = 'center'
      ctx.fillText('—', ix + boxInnerW / 2, cy + 20 + 14)
    } else {
      for (const slot of day.slots) {
        setFont(ctx, 800, 9.5)
        ctx.fillStyle = BRAND
        ctx.textAlign = 'left'
        ctx.fillText(slot.timeLabel, ix, cy + 10)
        cy += 13 + 6
        for (const bar of slot.pitches) {
          cy += compactBar(ctx, ix, cy, boxInnerW, bar, true)
        }
        cy += 8
      }
    }
    ctx.restore()
  }

  const measureBody = (ctx, x, y, draw) => {
    if (draw) {
      days.forEach((day, i) => drawColumn(ctx, x + i * (colW + gap), y, day))
    }
    let cy = y + boxH
    cy += 6 // legend marginTop
    if (draw) {
      setFont(ctx, 600, 11)
      ctx.fillStyle = MUTED
      ctx.textAlign = 'left'
      ctx.fillText(WEEK_LEGEND_TEXT, x, cy + 11)
    }
    cy += 14
    cy += 14 // saved-note marginTop
    cy += drawSavedNote(ctx, x, cy, contentW, draw)
    return cy - y
  }

  const headerH = drawHeader(measure, PAD_X, PAD_TOP, contentW, title, false)
  const bodyH = measureBody(measure, PAD_X, PAD_TOP + headerH, false)
  const footerH = drawFooter(measure, PAD_X, 0, contentW, false)
  const totalH = PAD_TOP + headerH + bodyH + footerH + PAD_BOTTOM

  const { canvas, ctx } = makeCard(width, totalH)
  drawHeader(ctx, PAD_X, PAD_TOP, contentW, title, true)
  measureBody(ctx, PAD_X, PAD_TOP + headerH, true)
  drawFooter(ctx, PAD_X, PAD_TOP + headerH + bodyH, contentW, true)
  return canvas
}
