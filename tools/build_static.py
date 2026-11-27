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
s=s.replace('https://afandinacars.github.io/','https://afandinacars.com/')
# --- keep internal pricing out of the public copy: work out each final price here,
# then drop Korea prices, formulas, margins and commissions from the published data.
import math
def _r(x): return int(math.floor(x+0.5))
def _int(x): return int(x) if float(x).is_integer() else x
def _num(v,d=0):
    try: return float(v) if v not in (None,"") else d
    except: return d
def _public_inventory(html):
    pat=r'(<script type="application/json" id="inventory">)(.*?)(</script>)'
    m=re.search(pat,html,re.S); inv=json.loads(m.group(2).replace('\\u003c','<'))
    P=inv.get('pricing') or {}; E=P.get('eg') or {}
    for c in inv.get('cars',[]):
        mode='eg' if c.get('auto')=='eg' else ('sa' if c.get('auto') else '')
        krw=_num(c.get('krw')); rate=_num(P.get('krwPerUsd'))
        if mode and krw and rate:
            car=krw/rate
            if mode=='sa':
                usd=car+_num(P.get('shipKorea'))+car*_num(P.get('customsPct'))/100+car*_num(P.get('vatPct'))/100+_num(P.get('shipSaudi'))+_num(P.get('clearance'))+_num(P.get('marginUsd'))
                r=_num(P.get('roundSar'),1) or 1
                c['price']=_int(_r(usd*_num(P.get('sarPerUsd'),3.75)/r)*r); c['currency']='SAR'; c['priceNote']='شامل التوصيل للرياض'
            else:
                usd=car+_num(E.get('shipping'))+_num(E.get('clearance'))+_num(E.get('commission'))
                r=_num(E.get('roundTo'),1) or 1; egp=_num(E.get('egpPerUsd'))
                if egp>0: c['price']=_int(_r(usd*egp/r)*r); c['currency']='EGP'
                else: c['price']=_int(_r(usd/r)*r); c['currency']='USD'
                if E.get('note'): c['priceNote']=E['note']
        elif mode:
            c['price']=None
        for k in ('krw','auto'): c.pop(k,None)
    inv['pricing']={}
    js=json.dumps(inv,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    return re.sub(pat,lambda mm:mm.group(1)+js+mm.group(3),html,count=1,flags=re.S)
s=_public_inventory(s)
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
 f'<meta property="og:description" content="{desc}"><meta property="og:image" content="https://afandinacars.com/assets/og-cover.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:type" content="website"><meta property="og:url" content="https://afandinacars.com/"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://afandinacars.com/assets/og-cover.jpg"><meta name="theme-color" content="#002838"><link rel="apple-touch-icon" href="assets/logo-t.png">'
 '<title>أفندينا موتورز | سيارات كورية مفحوصة في مصر والسعودية</title>'
 '<link rel="canonical" href="https://afandinacars.com/">'
 '<meta name="google-site-verification" content="xJOs4wAqrjDSPvfuxRlrdN_bTEex_lm_G-FJCN1y9n0">'
 '<link rel="icon" href="assets/logo.png">'
 '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
 '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "56777a6ca5a145afb55a2e568a230ffe"}\'></script>'
 '</head><body>')
out=head+s+'</body></html>'
os.makedirs(os.path.join(repo,'assets','cars'),exist_ok=True)
open(os.path.join(repo,'index.html'),'w',encoding='utf-8').write(out)
open(os.path.join(repo,'.nojekyll'),'w').write('')
# ---- per-car share pages, sitemap, structured data ----
import html as _h, shutil as _sh, datetime as _dt
SITE="https://afandinacars.com/"
_inv=json.loads(re.search(r'<script type="application/json" id="inventory">(.*?)</script>',out,re.S).group(1).replace('\\u003c','<'))
FUEL={"petrol":"بنزين","diesel":"ديزل","hybrid":"هايبرد","ev":"كهرباء","lpg":"غاز"}
BR={"eg-10r":"العاشر من رمضان — مصر","eg-nasr":"مدينة نصر — مصر","sa-ryd":"الرياض — السعودية","kr":"في كوريا — جاهزة للشحن"}
CUR={"EGP":"ج.م","SAR":"ر.س","USD":"$","KRW":"₩"}
cdir=os.path.join(repo,'car')
if os.path.isdir(cdir): _sh.rmtree(cdir)
urls=[SITE]; items=[]
for c in _inv.get('cars',[]):
    if c.get('status')=='sold': continue
    cid=re.sub(r'[^A-Za-z0-9-]','',c.get('id',''))
    if not cid: continue
    name=" ".join(str(x) for x in [c.get('brand'),c.get('model'),c.get('trim'),c.get('year')] if x)
    price=c.get('price'); cur=c.get('currency') or ''
    ptxt=(f"{int(price):,} {CUR.get(cur,cur)}" if isinstance(price,(int,float)) else "السعر عند التواصل")
    bits=[x for x in [c.get('color'),FUEL.get(c.get('fuel') or ''),(f"{int(c['km']):,} كم" if isinstance(c.get('km'),(int,float)) else None),BR.get(c.get('branch') or '')] if x]
    desc=" · ".join([ptxt]+bits)
    ph=(c.get('photos') or [None])[0]
    img=SITE+"assets/cars/"+ph['id']+".jpg" if ph and ph.get('id') else SITE+"assets/og-cover.jpg"
    url=f"{SITE}car/{cid}/"; target=f"{SITE}#car-{cid}"
    E=lambda t:_h.escape(str(t),quote=True)
    page=f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(name)} | أفندينا موتورز</title><meta name="description" content="{E(desc)}">
<link rel="canonical" href="{E(url)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="أفندينا موتورز">
<meta property="og:title" content="{E(name)} — أفندينا موتورز"><meta property="og:description" content="{E(desc)}">
<meta property="og:image" content="{E(img)}"><meta property="og:url" content="{E(url)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{E(img)}">
<link rel="icon" href="../../assets/logo.png">
<style>body{{margin:0;font:16px/1.6 system-ui,sans-serif;background:#F3F5F7;color:#0B1E28;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}}a{{color:#C42320}}img{{max-width:100%;border-radius:14px;display:block;margin:0 auto 12px;max-height:60vh}}main{{max-width:520px;text-align:center}}</style>
<script>location.replace({json.dumps(target)});</script></head>
<body><main><img src="{E(img)}" alt="{E(name)}"><h1 style="font-size:1.3rem;margin:0">{E(name)}</h1><p>{E(desc)}</p><p><a href="{E(target)}">افتح العربية في معرض أفندينا موتورز</a></p></main></body></html>"""
    os.makedirs(os.path.join(cdir,cid),exist_ok=True)
    open(os.path.join(cdir,cid,'index.html'),'w',encoding='utf-8').write(page)
    urls.append(url)
    offer={"@type":"Offer","availability":"https://schema.org/InStock","url":url}
    if isinstance(price,(int,float)) and cur in ("EGP","SAR","USD"): offer.update(price=int(price),priceCurrency=cur)
    item={"@type":"Car","name":name,"brand":{"@type":"Brand","name":c.get('brand')},"model":c.get('model'),"image":img,"url":url,"offers":offer}
    if c.get('year'): item["vehicleModelDate"]=str(c['year'])
    if c.get('color'): item["color"]=c['color']
    if isinstance(c.get('km'),(int,float)): item["mileageFromOdometer"]={"@type":"QuantitativeValue","value":c['km'],"unitCode":"KMT"}
    items.append(item)
today=_dt.date.today().isoformat()
open(os.path.join(repo,'sitemap.xml'),'w',encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+"".join(f"  <url><loc>{_h.escape(u)}</loc><lastmod>{today}</lastmod></url>\n" for u in urls)+'</urlset>\n')
open(os.path.join(repo,'robots.txt'),'w').write("User-agent: *\nAllow: /\nSitemap: "+SITE+"sitemap.xml\n")
ld={"@context":"https://schema.org","@graph":[{"@type":"AutoDealer","name":"أفندينا موتورز — AFANDINA MOTORS","url":SITE,"logo":SITE+"assets/logo.png","image":SITE+"assets/og-cover.jpg",
  "telephone":["+201113298457","+966569634665"],
  "address":[{"@type":"PostalAddress","streetAddress":"سكاي دجلة مول","addressLocality":"العاشر من رمضان","addressCountry":"EG"},
             {"@type":"PostalAddress","streetAddress":"عمارة اللؤلؤة رقم 4، شارع المهندسين العسكريين، متفرع من شارع الطيران","addressLocality":"مدينة نصر، القاهرة","addressCountry":"EG"},
             {"@type":"PostalAddress","streetAddress":"معارض القادسية، شارع وادي السرح","addressLocality":"الرياض","addressCountry":"SA"}],
  "sameAs":["https://www.facebook.com/share/1DxkQSqzT5/","https://www.instagram.com/afandina.motors","https://www.tiktok.com/@afandinamotors2024","https://youtube.com/@afandinamotors"]},
  {"@type":"ItemList","name":"السيارات المتاحة","itemListElement":[{"@type":"ListItem","position":i+1,"item":it} for i,it in enumerate(items)]}]}
ldjs=json.dumps(ld,ensure_ascii=False).replace('<','\\u003c')
idx=open(os.path.join(repo,'index.html'),encoding='utf-8').read()
idx=idx.replace('</head>','<script type="application/ld+json">'+ldjs+'</script></head>',1)
open(os.path.join(repo,'index.html'),'w',encoding='utf-8').write(idx)
inv=json.loads(re.search(r'<script type="application/json" id="inventory">(.*?)</script>',s,re.S).group(1).replace('\\u003c','<'))
print(json.dumps(sorted({x for c in inv['cars'] for p in c.get('photos',[]) for x in (p.get('id'),p.get('t')) if x})))
