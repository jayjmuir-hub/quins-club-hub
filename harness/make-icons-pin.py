# ⚠️ SUPERSEDED — harness/make-icons-wings.py builds the CURRENT icon set.
# The pin era lasted one day: shipped in #393 (24-25 Aug 2026), replaced by
# the flat crest on the green gradient with red bat-wing arcs, which Jay
# approved on 25 Aug 2026. This script and harness/pin-photo.jpg /
# harness/pin-cut.png stay in the repo the same way make-icons.mjs stayed
# when this one superseded it: the recipe records a look that shipped, and
# deleting it is how a look becomes unrecoverable.
#
# Builds the installed-app icon set from harness/pin-photo.jpg — the enamel
# lapel-pin rendition of the crest, on the accent-green gradient Jay chose.
#
# Run by hand, from the repo root:
#   pip install pillow opencv-python-headless   (one-off)
#   python harness/make-icons-pin.py
#
# ⚠️ IT WRITES STRAIGHT INTO public/icons/. Check `git diff --stat` after, and
# look at the PNGs, before committing — this is a design asset, and the only
# real test of it is somebody's eyes at 48px on a phone.
#
# ── History, and what this supersedes ───────────────────────────────────────
# harness/make-icons.mjs (kept, with a pointer here) built the previous set:
# the flattened "CLUB HUB" crest on a white tile. On 24-25 Aug 2026 Jay walked
# the icon through several looks in session — green tiles, synthetic pin
# treatments in gold/silver/gunmetal — and settled on the REAL thing: a
# photographic enamel-pin image of the full club crest (pin-photo.jpg, an
# AI-generated product shot; no physical pin was photographed), on a gradient
# of the app's accent green, lit at the top and deepening at the base.
# Decisions that survived the session and are parameters below:
#   · tile: accent-green gradient (56,178,100) -> (16,78,44) — "the gradient
#     but with C", after flat accent green lost the pin's own enamel green
#   · pin size: 74% of tile height on square icons; 58% on MASKABLE, because
#     Android may crop maskable icons to a circle whose safe zone is 80% of
#     the edge — at 74% the shield's corners would be inside the crop
#   · purpose-any icons and the favicon carry the PIN ALONE on transparency,
#     matching the old set's convention (mark on 'any', tile on 'maskable')
#   · the full club wording stays on the pin — it is texture at 48px, and Jay
#     chose the badge-as-object look over the 14 Aug "strip the wording" brief
#
# ── The cut, and why an intermediate is committed ───────────────────────────
# The pin is separated from its background with OpenCV GrabCut, then the mask
# is GROWN outward and pushed back only where the grown ring is green cloth —
# the first cut shaved the outer silver rim, and Jay caught it ("i don't think
# you need to cutoff the metal"). GrabCut's result can drift across OpenCV
# versions, so the cut is committed as harness/pin-cut.png: the compose step
# below reads the committed cut when present and only re-runs the cut when it
# is missing (or FORCE_RECUT=1). Deleting pin-cut.png is therefore safe but
# may shift the outline by a pixel or two on a different OpenCV.

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, 'public', 'icons')
PHOTO = os.path.join(HERE, 'pin-photo.jpg')
CUT = os.path.join(HERE, 'pin-cut.png')

GRAD_TOP = (56, 178, 100)
GRAD_BOT = (16, 78, 44)
PIN_HEIGHT_FRAC = 0.74      # square icons
PIN_HEIGHT_FRAC_MASKABLE = 0.58  # inside Android's circular safe zone


def cut_pin():
    import cv2
    import numpy as np

    img = cv2.imread(PHOTO)
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w * 0.03), int(h * 0.02), int(w * 0.90), int(h * 0.95))
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, rect, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    num, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if num > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        m = np.where(labels == largest, 255, 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    m2 = np.zeros_like(m)
    cv2.drawContours(m2, cnts, -1, 255, thickness=cv2.FILLED)

    # Grow, then push back only where the grown ring is clearly green cloth —
    # this is what keeps the outer silver rim.
    grown = cv2.dilate(m2, np.ones((17, 17), np.uint8))
    ring = cv2.subtract(grown, m2)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hch, sch = hsv[:, :, 0], hsv[:, :, 1]
    cloth = ((hch > 35) & (hch < 95) & (sch > 60)).astype(np.uint8) * 255
    keep_ring = cv2.subtract(ring, cv2.bitwise_and(ring, cloth))
    final = cv2.bitwise_or(m2, keep_ring)
    final = cv2.morphologyEx(final, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cnts, _ = cv2.findContours(final, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    final2 = np.zeros_like(final)
    cv2.drawContours(final2, cnts, -1, 255, thickness=cv2.FILLED)
    final2 = cv2.GaussianBlur(final2, (5, 5), 0)

    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = final2
    x, y, bw, bh = cv2.boundingRect((final2 > 127).astype(np.uint8))
    cv2.imwrite(CUT, rgba[y:y + bh, x:x + bw])
    print('cut written:', CUT)


def gradient_tile(size):
    base = Image.new('RGBA', (size, size))
    p = base.load()
    for y in range(size):
        t = y / size
        row = (
            int(GRAD_TOP[0] * (1 - t) + GRAD_BOT[0] * t),
            int(GRAD_TOP[1] * (1 - t) + GRAD_BOT[1] * t),
            int(GRAD_TOP[2] * (1 - t) + GRAD_BOT[2] * t),
            255,
        )
        for x in range(size):
            p[x, y] = row
    return base


def compose(pin, size, height_frac, tile):
    base = gradient_tile(size) if tile else Image.new('RGBA', (size, size), (0, 0, 0, 0))
    nh = int(size * height_frac)
    k = nh / pin.size[1]
    nw = int(pin.size[0] * k)
    small = pin.resize((nw, nh), Image.LANCZOS)
    if tile:
        # a soft shadow only makes sense over a ground
        shm = small.split()[3].filter(ImageFilter.GaussianBlur(max(2, size // 73)))
        shl = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shl.paste((0, 8, 4, 170), ((size - nw) // 2 + size // 128, (size - nh) // 2 + size // 51), shm)
        base = Image.alpha_composite(base, shl)
    base.paste(small, ((size - nw) // 2, (size - nh) // 2), small)
    return base


def main():
    if not os.path.exists(CUT) or os.environ.get('FORCE_RECUT') == '1':
        cut_pin()
    pin = Image.open(CUT).convert('RGBA')
    os.makedirs(OUT, exist_ok=True)

    # purpose "any" + favicon: the pin alone on transparency
    for name, size in (('icon-512', 512), ('icon-192', 192), ('favicon-32', 32)):
        compose(pin, size, 0.96, tile=False).save(os.path.join(OUT, f'{name}.png'))
    # full-bleed tiles: Apple touch (iOS rounds it), maskable (Android crops it)
    compose(pin, 180, PIN_HEIGHT_FRAC, tile=True).save(os.path.join(OUT, 'apple-touch-icon.png'))
    for name, size in (('maskable-512', 512), ('maskable-192', 192)):
        compose(pin, size, PIN_HEIGHT_FRAC_MASKABLE, tile=True).save(os.path.join(OUT, f'{name}.png'))
    print('icons written to', OUT)


if __name__ == '__main__':
    sys.exit(main())
