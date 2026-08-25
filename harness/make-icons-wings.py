# Builds the installed-app icon set: the flat "CLUB HUB" crest on the
# accent-green gradient with red bat-wing arcs rising from the bottom corners
# — the design Jay approved on 25 Aug 2026. The approved render is committed
# at claude/handoffs/assets/2026-08-25-icon-wing-master-512.png and this
# script regenerates it from the recipe; `python harness/make-icons-wings.py`
# prints the pixel difference against that asset so drift is measurable.
#
# Run by hand, from the repo root:
#   pip install pillow opencv-python-headless   (one-off)
#   python harness/make-icons-wings.py
#
# ⚠️ IT WRITES STRAIGHT INTO public/icons/. Check `git diff --stat` after, and
# look at the PNGs, before committing — this is a design asset, and the only
# real test of it is somebody's eyes at 48px on a phone.
#
# ── History, and what this supersedes ───────────────────────────────────────
# harness/make-icons-pin.py (kept, with a pointer here) built the enamel-pin
# set that shipped in #393 and was live for one day. On 25 Aug 2026 Jay
# pivoted back to the flat crest ("lets go back to the previous logo but use
# the green gradient background"), then walked the red in: corner fades, a
# glow behind the crest, curved arcs ("almost like its bat wings"), a
# scalloped variant, and finally the scalloped arc toned down. Decisions that
# survived and are parameters below:
#   · tile: the same accent-green gradient as the pin era,
#     (56,178,100) -> (16,78,44)
#   · wings: red gradient (200,16,46) -> (120,10,28) mapped over the full
#     tile height, shown where y > wing(x) with u = |x-256|/256 and
#     wing = 470 - 128*u^1.5 - 18*|sin(2*pi*u)| — the toned-down numbers;
#     the rejected bigger arc was 462 - 156*u^1.5 - 26*|sin(2*pi*u)|
#   · red touches green only at HARD edges or from BEHIND the crest as a
#     glow — soft red-into-green fades blend to mud and were rejected
#   · crest: 74% of tile height on square tiles; 58% on MASKABLE, because
#     Android may crop maskable icons to a circle whose safe zone is 80% of
#     the edge. The maskable wings are also RAISED (see WING_RAISE_MASKABLE)
#     — at the master's numbers the red band starts below the safe circle
#     and a circular crop would remove the wings entirely.
#   · purpose-any icons and the favicon carry the CREST ALONE on
#     transparency, matching both earlier sets' convention (mark on 'any',
#     tile on 'maskable' and apple-touch)
#
# ── The crest source, and why it comes out of git ───────────────────────────
# The artwork is the pre-pin icon-512.png, extracted from git at SHA 0006574
# (after #393 the working-tree copy is the PIN, not this). It needs cleaning:
# the old export carries a white anti-aliasing fringe and three pinholes.
# The cleaned crest is committed as harness/crest-wing-cut.png; the clean
# step re-runs only when that file is missing (or FORCE_RECUT=1), because
# cv2.inpaint output can drift across OpenCV versions. The clean recipe —
# each step earned in session, do not "simplify":
#   mask = alpha >= 240 -> largest connected component -> flood-fill hole
#   close -> MinFilter(3) erode x2 (kills the white fringe) -> NO blur on
#   the mask (blur reached back into the old shadow ring and made dark
#   specks; the LANCZOS downscale supplies the anti-aliasing) ->
#   cv2.inpaint the pinhole pixels so the closed holes get sensible colour.
#
# ── Filenames: the -v2 suffix ───────────────────────────────────────────────
# Every icon is written under a NEW name (icon-512-v2.png etc.) and the
# manifest/index.html/push-sw.js point at the -v2 names. Agreed with Jay:
# already-installed Androids only pick a new icon up when the URL changes —
# same-URL byte changes do NOT propagate. (iPhones never auto-update icons:
# remove + re-add, Apple's rule.) The LEGACY names are also overwritten with
# the same new artwork, so a phone whose cached manifest still points at the
# old URLs — and push notifications rendered from an old service worker —
# show the new mark rather than the retired pin.

import os
import subprocess
import sys
import math

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, 'public', 'icons')
CUT = os.path.join(HERE, 'crest-wing-cut.png')
APPROVED = os.path.join(
    REPO, 'claude', 'handoffs', 'assets', '2026-08-25-icon-wing-master-512.png')

CREST_SHA = '0006574'          # pre-pin commit whose icon-512.png is the crest
GRAD_TOP = (56, 178, 100)
GRAD_BOT = (16, 78, 44)
RED_TOP = (200, 16, 46)
RED_BOT = (120, 10, 28)
CREST_FRAC = 0.74              # square tiles (apple-touch, the master)
CREST_FRAC_MASKABLE = 0.58     # inside Android's circular safe zone
WING_RAISE_MASKABLE = 36       # lift the wings into the safe circle


def cut_crest():
    import cv2
    import numpy as np

    raw = subprocess.run(
        ['git', 'show', f'{CREST_SHA}:public/icons/icon-512.png'],
        cwd=REPO, capture_output=True, check=True).stdout
    tmp = os.path.join(HERE, '_crest_src.png')
    with open(tmp, 'wb') as f:
        f.write(raw)
    img = cv2.imread(tmp, cv2.IMREAD_UNCHANGED)
    os.remove(tmp)

    alpha = img[:, :, 3]
    m = (alpha >= 240).astype(np.uint8) * 255

    num, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if num > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        m = np.where(labels == largest, 255, 0).astype(np.uint8)

    # Close the pinholes: flood the OUTSIDE from a corner; anything neither
    # crest nor outside is a hole. Remember the hole pixels for inpainting.
    flood = m.copy()
    ffmask = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8)
    cv2.floodFill(flood, ffmask, (0, 0), 255)
    holes = cv2.bitwise_not(flood) & cv2.bitwise_not(m)
    m = cv2.bitwise_or(m, holes)

    # MinFilter(3) x2 in PIL terms — the fringe kill. No blur (see header).
    mp = Image.fromarray(m).filter(ImageFilter.MinFilter(3)).filter(
        ImageFilter.MinFilter(3))
    m = np.array(mp)

    bgr = img[:, :, :3]
    if holes.any():
        bgr = cv2.inpaint(bgr, (holes > 0).astype(np.uint8), 3, cv2.INPAINT_TELEA)

    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = m
    x, y, bw, bh = cv2.boundingRect((m > 127).astype(np.uint8))
    cv2.imwrite(CUT, rgba[y:y + bh, x:x + bw])
    print('cut written:', CUT)


def wing_y(x, size, raise_px=0):
    # Integer-x u, exactly as the approved master was rendered — it makes the
    # curve a pixel asymmetric (mirror of x=3 is x=509, not x=505) and a
    # symmetric x+0.5 "fix" measurably diverges from the approved PNG.
    u = abs(x - size / 2) / (size / 2)
    w = 470 - 128 * u ** 1.5 - 18 * abs(math.sin(2 * math.pi * u))
    return (w - raise_px) * size / 512


def tile_with_wings(size, raise_px=0):
    im = Image.new('RGBA', (size, size))
    p = im.load()
    for x in range(size):
        wy = wing_y(x, size, raise_px)
        for y in range(size):
            t = y / size
            if y > wy:
                row = (
                    int(RED_TOP[0] * (1 - t) + RED_BOT[0] * t),
                    int(RED_TOP[1] * (1 - t) + RED_BOT[1] * t),
                    int(RED_TOP[2] * (1 - t) + RED_BOT[2] * t),
                    255,
                )
            else:
                row = (
                    int(GRAD_TOP[0] * (1 - t) + GRAD_BOT[0] * t),
                    int(GRAD_TOP[1] * (1 - t) + GRAD_BOT[1] * t),
                    int(GRAD_TOP[2] * (1 - t) + GRAD_BOT[2] * t),
                    255,
                )
            p[x, y] = row
    return im


def compose_tile(crest, size, crest_frac, raise_px=0):
    """The full composition: gradient+wings, red glow, shadow, crest."""
    base = tile_with_wings(size, raise_px)

    nh = int(size * crest_frac)
    k = nh / crest.size[1]
    nw = int(crest.size[0] * k)
    small = crest.resize((nw, nh), Image.LANCZOS)
    ox, oy = (size - nw) // 2, (size - nh) // 2

    placed_alpha = Image.new('L', (size, size), 0)
    placed_alpha.paste(small.split()[3], (ox, oy))

    # Red glow BEHIND the crest — the one approved way red meets green softly.
    # BoxBlur + paste semantics, found by searching blur/paint variants
    # against the approved master: Gaussian spreads the glow visibly further
    # up the tile than the approved render, box blur matches it. The best
    # reachable reproduction differs from the approved PNG by ~1.1 mean
    # channel units (worst pixel 40, deep in the soft glow ramp) —
    # imperceptible; the script prints the measured diff on every run.
    s = size / 512
    glow_a = placed_alpha.filter(ImageFilter.BoxBlur(26 * s))
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow.paste(RED_TOP + (170,), (0, 0), glow_a)
    glow = glow.filter(ImageFilter.BoxBlur(14 * s))
    base = Image.alpha_composite(base, glow)

    shadow_a = placed_alpha.filter(ImageFilter.GaussianBlur(7 * s))
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shadow.paste((0, 8, 4, 150), (round(4 * s), round(10 * s)), shadow_a)
    base = Image.alpha_composite(base, shadow)

    base.paste(small, (ox, oy), small)
    return base


def compose_mark(crest, size):
    """The crest alone on transparency, for purpose-any icons + favicon."""
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    nh = int(size * 0.96)
    k = nh / crest.size[1]
    nw = int(crest.size[0] * k)
    small = crest.resize((nw, nh), Image.LANCZOS)
    base.paste(small, ((size - nw) // 2, (size - nh) // 2), small)
    return base


def diff_report(a, b):
    import numpy as np
    da = np.asarray(a.convert('RGB'), dtype=int)
    db = np.asarray(b.convert('RGB'), dtype=int)
    d = np.abs(da - db)
    return d.max(), d.mean()


def main():
    if not os.path.exists(CUT) or os.environ.get('FORCE_RECUT') == '1':
        cut_crest()
    crest = Image.open(CUT).convert('RGBA')
    os.makedirs(OUT, exist_ok=True)

    master = compose_tile(crest, 512, CREST_FRAC)
    if os.path.exists(APPROVED):
        mx, mean = diff_report(master, Image.open(APPROVED))
        print(f'vs approved master: max channel diff {mx}, mean {mean:.3f}')

    mask512 = compose_tile(crest, 512, CREST_FRAC_MASKABLE, WING_RAISE_MASKABLE)

    out = {}
    # purpose "any" + favicon: the crest alone on transparency
    for name, size in (('icon-512', 512), ('icon-192', 192), ('favicon-32', 32)):
        out[name] = compose_mark(crest, size)
    # full-bleed tiles: Apple touch (iOS rounds it), maskable (Android crops it)
    out['apple-touch-icon'] = master.resize((180, 180), Image.LANCZOS)
    out['maskable-512'] = mask512
    out['maskable-192'] = mask512.resize((192, 192), Image.LANCZOS)

    for name, im in out.items():
        im.save(os.path.join(OUT, f'{name}-v2.png'))
        im.save(os.path.join(OUT, f'{name}.png'))  # legacy URLs — see header
    print('icons written to', OUT)


if __name__ == '__main__':
    sys.exit(main())
