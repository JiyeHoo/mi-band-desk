"""Lossless PNG compression for the versioned Codex assets; preserve exact RGBA."""
from pathlib import Path
from PIL import Image
from io import BytesIO
import sys
saved = 0
for path in Path(sys.argv[1]).glob('*/codex-v082-*.png'):
    original = Image.open(path).convert('RGBA')
    image = original.convert('RGB') if original.getchannel('A').getextrema() == (255, 255) else original
    before = path.stat().st_size
    direct = BytesIO()
    image.save(direct, format='PNG', optimize=True, compress_level=9)
    encoded = direct.getvalue()
    # Index the exact colors when they fit PNG's palette; no quantization.
    colors = sorted(set(original.getdata()))
    if len(colors) <= 256:
        lookup = {rgba: index for index, rgba in enumerate(colors)}
        indexed = Image.new('P', original.size)
        indexed.putpalette([v for rgba in colors for v in rgba[:3]] + [0] * (768 - 3 * len(colors)))
        indexed.putdata([lookup[rgba] for rgba in original.getdata()])
        palette = BytesIO()
        alpha = {'transparency': bytes(rgba[3] for rgba in colors)} if any(rgba[3] != 255 for rgba in colors) else {}
        indexed.save(palette, format='PNG', optimize=True, compress_level=9, **alpha)
        if len(palette.getvalue()) < len(encoded):
            encoded = palette.getvalue()
    path.write_bytes(encoded)
    assert Image.open(path).convert('RGBA').tobytes() == original.tobytes(), path
    saved += before - path.stat().st_size
print(f'Codex PNG optimization: {saved} bytes saved; pixel-identical')
