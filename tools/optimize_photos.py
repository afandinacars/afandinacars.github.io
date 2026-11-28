"""Shrink car photos copied from the admin artifact so the public site stays fast.

Usage: python3 -I tools/optimize_photos.py <admin index.html> <repo dir>

Full photos ("id") are capped at 1600px (JPEG q82), thumbnails ("t") at 480px (q72).
Files already within the limit are left untouched, so running it again changes nothing.
"""
import json, os, re, sys
from PIL import Image, ImageOps

html, repo = sys.argv[1], sys.argv[2]
s = open(html, encoding='utf-8').read()
inv = json.loads(re.search(r'<script type="application/json" id="inventory">(.*?)</script>', s, re.S).group(1).replace('\\u003c', '<'))
pics = [p for c in inv['cars'] for p in (c.get('photos') or []) + (c.get('report') or [])]
pics += [r['cover'] for r in (inv.get('reviews') or []) if isinstance(r.get('cover'), dict)]

done = 0
for p in pics:
    for key, mx, q in (('id', 1600, 82), ('t', 480, 72)):
        aid = p.get(key)
        if not aid:
            continue
        f = os.path.join(repo, 'assets', 'cars', aid + '.jpg')
        if not os.path.exists(f):
            continue
        try:
            im = Image.open(f)
            if max(im.size) <= mx and im.format == 'JPEG':
                continue
            im = ImageOps.exif_transpose(im).convert('RGB')
            im.thumbnail((mx, mx), Image.LANCZOS)
            im.save(f, 'JPEG', quality=q, optimize=True)
            done += 1
        except Exception as e:
            print('skip', aid, e, file=sys.stderr)
print('optimized', done)
