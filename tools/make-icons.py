import zlib, struct, os, sys

BG   = (79, 70, 229, 255)      # indigo
FG   = (255, 255, 255, 255)

BOLT = [(0.575,0.055),(0.265,0.545),(0.455,0.545),(0.375,0.945),(0.735,0.435),(0.525,0.435)]

def inpoly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xint = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xint:
                inside = not inside
    return inside

def rounded(x, y, w, h, r):
    """Point-in-rounded-rect for a rect at origin with side w,h and radius r."""
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r or (r <= x <= w - r) or (r <= y <= h - r)

def render(size, pad):
    """Returns RGBA bytes rows. pad = fraction of inset for the glyph (maskable safe zone)."""
    rad = size * 0.22
    rows = []
    span = size * (1 - 2 * pad)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            x, y = px + 0.5, py + 0.5
            if not rounded(x, y, size, size, rad):
                row += bytes((0, 0, 0, 0))
                continue
            gx = (x - size * pad) / span
            gy = (y - size * pad) / span
            px_col = FG if (0 <= gx <= 1 and 0 <= gy <= 1 and inpoly(gx, gy, BOLT)) else BG
            row += bytes(px_col)
        rows.append(bytes(row))
    return rows

def write_png(path, size, pad=0.22, opaque=False):
    rows = render(size, pad)
    raw = b''.join(b'\x00' + r for r in rows)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(png)
    print(f'{path}  {size}x{size}  {len(png)} bytes')

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
write_png(f'{out}/icon-192.png', 192, 0.24)
write_png(f'{out}/icon-512.png', 512, 0.24)
write_png(f'{out}/icon-maskable-512.png', 512, 0.30)
write_png(f'{out}/apple-touch-icon.png', 180, 0.22)
