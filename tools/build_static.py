"""Build the public GitHub Pages copy of the Afandina showroom from the artifact HTML.
usage: python3 build_static.py <artifact_html> <repo_dir>
Maps /_blob/<id> -> assets/<file>; car photos -> assets/cars/<id>.jpg (must be copied separately)."""
import sys,re,os,json
src,repo=sys.argv[1],sys.argv[2]
s=open(src,encoding='utf-8').read()
# strip any doctype skeleton the artifact service added
i=s.find('<title>'); 
if i>0: s=s[i:]
s=re.sub(r'</body></html>\s*$','',s)
KNOWN={"f12fd7cb2e7041627339683dc8e6eb93":"assets/logo.png","c609bd84c88433314a1323d4fdd3fff5":"assets/logo-t.png","cdb8170f55023d47599e147bc23f4ff5":"assets/hero-bmw.jpg",
"0e99f9110f08e3ba07e3c220ecff476e":"assets/hero-kia.jpg","4da07f430d881867717866663b27b1dd":"assets/hero-hyundai.jpg","6dc41e5ecf90127c52759db6d298104d":"assets/hero-amg.jpg"}
for k,v in KNOWN.items(): s=s.replace('/_blob/'+k,v)
s=s.replace('const photoUrl=p=>p&&p.id?"/_blob/"+encodeURIComponent(p.id):"";','const photoUrl=p=>p&&p.id?"assets/cars/"+encodeURIComponent(p.id)+".jpg":"";')
s=s.replace('const thumbUrl=p=>p&&(p.t||p.id)?"/_blob/"+encodeURIComponent(p.t||p.id):"";','const thumbUrl=p=>p&&(p.t||p.id)?"assets/cars/"+encodeURIComponent(p.t||p.id)+".jpg":"";')
assert '/_blob/' not in s.split('<script id="main">')[0], 'unmapped blob in markup'
desc='معرض أفندينا موتورز: سيارات كورية مفحوصة متاحة في مصر والسعودية — كيا، هيونداي، جينيسيس وغيرها. تواصل على واتساب.'
head=('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
 f'<meta name="description" content="{desc}"><meta property="og:title" content="أفندينا موتورز — معرض السيارات">'
 f'<meta property="og:description" content="{desc}"><meta property="og:image" content="https://afandinacars.github.io/assets/og-cover.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:type" content="website"><meta property="og:url" content="https://afandinacars.github.io/"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://afandinacars.github.io/assets/og-cover.jpg"><meta name="theme-color" content="#002838"><link rel="apple-touch-icon" href="assets/logo-t.png">'
 '<link rel="icon" href="assets/logo.png">'
 '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
 '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "56777a6ca5a145afb55a2e568a230ffe"}\'></script>'
 '</head><body>')
out=head+s+'</body></html>'
os.makedirs(os.path.join(repo,'assets','cars'),exist_ok=True)
open(os.path.join(repo,'index.html'),'w',encoding='utf-8').write(out)
open(os.path.join(repo,'.nojekyll'),'w').write('')
inv=json.loads(re.search(r'<script type="application/json" id="inventory">(.*?)</script>',s,re.S).group(1).replace('\\u003c','<'))
print(json.dumps(sorted({x for c in inv['cars'] for p in c.get('photos',[]) for x in (p.get('id'),p.get('t')) if x})))
