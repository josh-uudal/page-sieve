"""Renders icon16/48/128.png from the shapes in icon.svg / icon-small.svg (no SVG library needed).

    python icons/render.py

Each icon is drawn 8x larger and scaled down, which gives smooth edges. Keep the numbers here in
step with the SVG files (both use a 96 x 96 grid).
"""
import pathlib

from PIL import Image, ImageChops, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
INK, BLUE, WHITE = (27, 28, 31, 255), (44, 75, 209, 255), (255, 255, 255, 255)
SS = 8  # supersampling factor

# icon.svg (48 and 128 px) and icon-small.svg (16 px: whole-pixel strokes, simpler mesh)
FULL = dict(
    page=[(16, 8), (56, 8), (78, 30), (78, 92), (16, 92)], fold=[(56, 8), (56, 30), (78, 30)], stroke=4,
    lines=[((26, 42), (48, 42)), ((26, 54), (40, 54))],
    handle=((79, 81), (90, 92), 7), c=(62, 64), ring=26, r=22, mesh_r=19, mesh_w=2.2,
    mesh=[50, 56, 62, 68, 74], mesh_h=[52, 58, 64, 70, 76],
)
SMALL = dict(
    page=[(14, 6), (55, 6), (78, 29), (78, 93), (14, 93)], fold=[(55, 6), (55, 29), (78, 29)], stroke=6,
    lines=[((27, 42), (39, 42))],
    handle=((80, 82), (90, 92), 10), c=(61, 63), ring=28, r=22, mesh_r=19, mesh_w=4.5,
    mesh=[54, 68], mesh_h=[56, 70],
)


def render(spec, size):
    k = size * SS / 96
    P = lambda pt: (pt[0] * k, pt[1] * k)
    img = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def line(pts, w, color=INK):
        pts = [P(p) for p in pts]
        d.line(pts, fill=color, width=round(w * k), joint='curve')
        for x, y in (pts[0], pts[-1]):  # round caps
            rr = w * k / 2
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=color)

    def circle(r, **kw):
        cx, cy = P(spec['c'])
        d.ellipse((cx - r * k, cy - r * k, cx + r * k, cy + r * k), **kw)

    s = spec['stroke']
    d.polygon([P(p) for p in spec['page']], fill=WHITE)
    line(spec['page'] + [spec['page'][0]], s)
    line(spec['fold'], s)
    for a, b in spec['lines']:
        line([a, b], s)
    a, b, w = spec['handle']
    line([a, b], w)
    circle(spec['ring'], fill=WHITE)
    circle(spec['r'], fill=BLUE)

    # mesh, kept inside the rim
    mesh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    md = ImageDraw.Draw(mesh)
    mw = round(spec['mesh_w'] * k)
    for x in spec['mesh']:
        md.line([P((x, 30)), P((x, 96))], fill=WHITE, width=mw)
    for y in spec['mesh_h']:
        md.line([P((30, y)), P((96, y))], fill=WHITE, width=mw)
    mask = Image.new('L', img.size, 0)
    cx, cy = P(spec['c'])
    rr = spec['mesh_r'] * k
    ImageDraw.Draw(mask).ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
    img.paste(mesh, (0, 0), ImageChops.multiply(mesh.getchannel('A'), mask))

    circle(spec['r'], outline=INK, width=round(s * k))
    return img.resize((size, size), Image.LANCZOS)


for size, spec in ((16, SMALL), (48, FULL), (128, FULL)):
    render(spec, size).save(HERE / f'icon{size}.png')
    print(f'icon{size}.png')
