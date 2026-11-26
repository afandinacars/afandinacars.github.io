(function () {
"use strict";
const CFG = window.APP_CONFIG || {};
const TZ = "Africa/Cairo";
const WD = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const LEAVE_TYPES = {annual:"سنوية",casual:"عارضة",sick:"مرضية",unpaid:"بدون مرتب",permission:"إذن"};
const STATUS = {ok:"حاضر",late:"متأخر",abs:"غياب",leave:"إجازة",off:"عطلة",wait:"لسه",open:"داخل الشغل",noout:"بدون انصراف",future:"—"};
const TOKEN_KEY = "afandina_att_token";
const S = {token:null, me:null, mode:"me", my:null, ad:null, tab:"today", todayFilter:"", lastReport:null};
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k instanceof Node ? k : document.createTextNode(String(k))); }
  return e;
}
function cairo(d = new Date()) {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-CA", {timeZone:TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"}).formatToParts(d)) p[x.type] = x.value;
  return {date:`${p.year}-${p.month}-${p.day}`, min:(+p.hour)*60 + (+p.minute), h:p.hour, m:p.minute, s:p.second};
}
function wday(date) { return new Date(date + "T12:00:00Z").getUTCDay(); }
function addDays(date, n) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function datesBetween(a, b) { const out = []; if (!a || !b || b < a) return out; let d = a, g = 0; while (d <= b && g < 400) { out.push(d); d = addDays(d, 1); g++; } return out; }
function monthEnd(ym) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
function hm(s) { if (!s) return 0; const [a, b] = String(s).split(":").map(Number); return (a || 0) * 60 + (b || 0); }
function fmtT(min) { if (min == null) return "—"; const H = Math.floor(min / 60), M = min % 60, h12 = ((H + 11) % 12) + 1; return `${h12}:${String(M).padStart(2, "0")} ${H < 12 ? "ص" : "م"}`; }
function fmtDur(m) { m = Math.round(m || 0); if (!m) return "0"; const H = Math.floor(m / 60), M = m % 60; return H ? (M ? `${H}س ${M}د` : `${H}س`) : `${M}د`; }
function fmtDate(date, opt) { return new Intl.DateTimeFormat("ar-EG-u-nu-latn", Object.assign({timeZone:"UTC", weekday:"long", day:"numeric", month:"long"}, opt || {})).format(new Date(date + "T12:00:00Z")); }
function chip(st, extra) { return h("span", {class:"chip c-" + st}, extra || STATUS[st] || st); }
function branchOf(list, id) { return (list || []).find(b => b.id === id) || null; }
function msgEl() { return h("div", {class:"msg", role:"status"}); }
function setMsg(el, text, good) { el.className = "msg " + (good ? "good" : "err"); el.textContent = text; }

function evalDay(date, day, branch, leaveSet, now) {
  const off = !!(branch && Array.isArray(branch.off) && branch.off.includes(wday(date)));
  const r = {date, status:"future", late:0, early:0, ot:0, worked:0, off, inMin:null, outMin:null, workday:!off};
  const st = branch ? hm(branch.start) : hm("09:00"), en = branch ? hm(branch.end) : hm("17:00"), g = branch ? (+branch.grace || 0) : 0;
  if (day && day.inMin != null) {
    r.inMin = day.inMin; r.outMin = day.outMin ?? null;
    if (!off && day.inMin > st + g) r.late = day.inMin - st;
    if (day.outMin != null) {
      r.worked = Math.max(0, day.outMin - day.inMin);
      if (off) r.ot = r.worked; else { r.ot = Math.max(0, day.outMin - en); r.early = Math.max(0, en - day.outMin); }
    }
    if (r.late) r.status = "late"; else if (day.outMin == null) r.status = date === now.date ? "open" : "noout"; else r.status = "ok";
    r.noOut = day.outMin == null && date < now.date;
  } else if (leaveSet.has(date)) r.status = "leave";
  else if (off) r.status = "off";
  else if (date < now.date) r.status = "abs";
  else if (date === now.date) r.status = now.min > st + g ? "abs" : "wait";
  return r;
}
function leaveSet(leaves) { const s = new Set(); for (const l of leaves) if (l.status === "approved" && l.type !== "permission") datesBetween(l.from, l.to).forEach(d => s.add(d)); return s; }
function summarize(rows, now) {
  const t = {workdays:0, present:0, abs:0, leave:0, lateN:0, lateMin:0, early:0, ot:0, worked:0, noout:0};
  for (const r of rows) {
    if (r.date > now.date) continue;
    if (r.workday) t.workdays++;
    if (r.inMin != null) t.present++;
    if (r.status === "abs" && r.date < now.date) t.abs++;
    if (r.status === "leave" && r.workday) t.leave++;
    if (r.late) { t.lateN++; t.lateMin += r.late; }
    t.early += r.early; t.ot += r.ot; t.worked += r.worked; if (r.noOut) t.noout++;
  }
  return t;
}

/* ---------- API ---------- */
async function api(action, payload) {
  let res;
  try {
    res = await fetch(CFG.API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(Object.assign({action, token:S.token}, payload || {}))});
  } catch (_) { throw {code:"network", message:"مفيش اتصال بالنت أو السيرفر مش راد. جرّب تاني."}; }
  let j; try { j = await res.json(); } catch (_) { throw {code:"server", message:"السيرفر رجّع رد غريب. اتأكد من رابط الـ API في config.js."}; }
  if (!j.ok) {
    if (j.code === "auth") { signOut(); }
    throw {code:j.code, message:j.message || "حصلت مشكلة"};
  }
  return j.data;
}

/* ---------- auth ---------- */
function jwtExp(t) { try { const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.exp * 1000; } catch (_) { return 0; } }
function saveToken(t) { S.token = t; try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {} }
function loadToken() { try { const t = localStorage.getItem(TOKEN_KEY); if (t && jwtExp(t) > Date.now() + 60000) return t; } catch (_) {} return null; }
function signOut() {
  S.token = null; S.me = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
  try { google.accounts.id.disableAutoSelect(); } catch (_) {}
  $("logout").hidden = true; $("modeSwitch").hidden = true;
  showLogin();
}
function notice(title, body) { $("view").replaceChildren(h("div", {class:"panel"}, h("h2", {text:title}), h("p", {class:"muted", text:body}))); }
function showLogin() {
  const btn = h("div", {id:"gbtn"});
  $("view").replaceChildren(h("div", {class:"panel login"},
    h("h2", {text:"سجّل دخول بحساب جوجل"}),
    h("p", {class:"muted small", text:"استخدم نفس الجيميل كل مرة. المدير بيوافق على حسابك أول مرة بس."}), btn));
  whenGoogle(() => { google.accounts.id.renderButton(btn, {theme:"filled_black", size:"large", shape:"pill", text:"signin_with", locale:"ar"}); google.accounts.id.prompt(); });
}
function whenGoogle(fn) { let n = 0; (function wait() { if (window.google && google.accounts && google.accounts.id) fn(); else if (n++ < 100) setTimeout(wait, 100); else notice("تسجيل الدخول مش شغال", "مقدرناش نحمّل زرار جوجل. اتأكد من النت وافتح الصفحة تاني."); })(); }

async function start() {
  $("view").replaceChildren(h("div", {class:"panel"}, h("div", {class:"empty-state", text:"جاري فتح حسابك…"})));
  try { S.me = await api("me"); }
  catch (e) { if (e.code !== "auth") notice("مقدرناش نفتح السيستم", e.message); return; }
  $("logout").hidden = false;
  if (S.me.isAdmin) {
    $("modeSwitch").hidden = false; S.mode = "admin";
    $("mAdmin").onclick = () => { S.mode = "admin"; render(); };
    $("mMe").onclick = () => { S.mode = "me"; render(); };
  }
  render();
}
function render() {
  $("mAdmin").setAttribute("aria-pressed", S.mode === "admin");
  $("mMe").setAttribute("aria-pressed", S.mode === "me");
  if (S.mode === "admin" && S.me.isAdmin) renderAdmin(); else renderEmployee();
}

/* ---------- employee ---------- */
async function renderEmployee() {
  const emp = S.me.employee, v = $("view");
  if (!emp) return v.replaceChildren(registerForm());
  if (emp.status === "pending") return v.replaceChildren(h("div", {class:"panel"}, h("h2", {text:"طلبك وصل للمدير"}),
    h("p", {class:"muted", text:`أهلاً ${emp.name}. أول ما المدير يوافق، افتح الصفحة تاني وهتلاقي زرار تسجيل الحضور.`}),
    h("div", null, h("button", {class:"btn sm", text:"تحديث", onclick:start}))));
  if (emp.status !== "active") return notice("حسابك موقوف", "المدير وقف تسجيلك في السيستم. لو ده غلط كلّمه.");
  v.replaceChildren(h("div", {class:"wrap", style:"gap:18px"},
    h("div", {id:"punchCard"}),
    h("div", {class:"panel"}, h("div", {class:"spread"}, h("h2", {text:"الشهر ده"}), h("span", {class:"muted small", id:"monthName"})), h("div", {class:"stats", id:"myStats"})),
    h("div", {class:"panel"}, h("h2", {text:"آخر الأيام"}), h("div", {class:"list", id:"myDays"}, h("div", {class:"empty-state", text:"جاري التحميل…"}))),
    leaveForm(),
    h("div", {class:"panel"}, h("h2", {text:"طلباتي"}), h("div", {class:"list", id:"myLeaves"}))));
  fillPunch();
  await loadMy();
}
function registerForm() {
  const bs = S.me.branches || [], msg = msgEl();
  const f = h("form", {class:"panel"},
    h("h2", {text:"تسجيل موظف جديد"}),
    h("p", {class:"muted small", text:`داخل بـ ${S.me.email}. اكتب بياناتك مرة واحدة، والمدير هيوافق عليك.`}),
    h("div", {class:"grid2"},
      h("label", {class:"f"}, "الاسم بالكامل", h("input", {id:"rName", required:true, maxlength:"60", autocomplete:"name", value:S.me.googleName || ""})),
      h("label", {class:"f"}, "رقم الموبايل", h("input", {id:"rPhone", inputmode:"tel", maxlength:"20", dir:"ltr"})),
      h("label", {class:"f"}, "الفرع", h("select", {id:"rBranch"}, bs.map(b => h("option", {value:b.id}, b.name))))),
    h("div", {class:"row"}, h("button", {class:"btn primary", type:"submit", text:"إرسال للمدير"})), msg);
  f.addEventListener("submit", async ev => {
    ev.preventDefault(); const b = f.querySelector("button"); b.disabled = true;
    try { S.me.employee = await api("register", {name:$("rName").value, phone:$("rPhone").value, branchId:$("rBranch").value}); render(); }
    catch (e) { setMsg(msg, e.message); b.disabled = false; }
  });
  return f;
}
async function loadMy() {
  try { S.my = await api("myMonth", {ym:cairo().date.slice(0, 7)}); fillPunch(); fillMonth(); }
  catch (e) { const d = $("myDays"); if (d) d.replaceChildren(h("div", {class:"empty-state", text:e.message})); }
}
function myBranch() { return branchOf(S.me.branches, S.me.employee.branchId); }
let confirmOut = false;
function fillPunch() {
  const box = $("punchCard"); if (!box) return;
  const now = cairo(), br = myBranch(), emp = S.me.employee;
  const day = S.my ? S.my.days.find(d => d.date === now.date) : null;
  const head = h("div", {class:"card-head"},
    h("div", null, h("div", {class:"d", text:fmtDate(now.date)}), h("div", {class:"clock", id:"clock", text:`${now.h}:${now.m}:${now.s}`})),
    h("div", {style:"text-align:left"}, h("div", {style:"font-weight:600", text:emp.name}),
      h("div", {class:"d", text:br ? `فرع ${br.name} · ${fmtT(hm(br.start))} – ${fmtT(hm(br.end))}` : "لم يحدد الفرع"})));
  const slot = (lbl, min) => h("div", {class:"slot"}, h("span", {class:"lbl", text:lbl}), h("span", {class:"stamp" + (min == null ? " empty" : ""), text:min == null ? "--:--" : fmtT(min)}));
  const body = h("div", {class:"card-body"}), msg = msgEl();
  if (!S.my) body.append(h("button", {class:"bigbtn", disabled:true, text:"جاري التحميل…"}));
  else {
    const ev = evalDay(now.date, day, br, leaveSet(S.my.leaves), now);
    if (!day || day.outMin == null) {
      const isOut = !!day;
      const b = h("button", {class:"bigbtn" + (isOut ? " out" : ""), text:isOut ? (confirmOut ? "اضغط تاني لتأكيد الانصراف" : "تسجيل انصراف") : "تسجيل حضور"});
      b.onclick = async () => {
        if (isOut && !confirmOut) { confirmOut = true; fillPunch(); setTimeout(() => { if (confirmOut) { confirmOut = false; fillPunch(); } }, 5000); return; }
        confirmOut = false; b.disabled = true;
        const needGps = br && br.lat != null;
        b.textContent = "جاري تحديد موقعك…";
        const pos = await getPos();
        if (!pos && needGps) { setMsg(msg, "مقدرناش نحدد موقعك. افتح الـ GPS واسمح للمتصفح يوصل للموقع، وجرّب تاني."); b.disabled = false; b.textContent = isOut ? "تسجيل انصراف" : "تسجيل حضور"; return; }
        b.textContent = "جاري التسجيل…";
        try { const r = await api("punch", pos || {}); setMsg(msg, r.kind === "in" ? `اتسجل حضورك الساعة ${r.time}` : `اتسجل انصرافك الساعة ${r.time}`, true); await loadMy(); }
        catch (e) { setMsg(msg, e.message); b.disabled = false; b.textContent = isOut ? "تسجيل انصراف" : "تسجيل حضور"; }
      };
      body.append(b);
      if (isOut && ev.late) body.append(h("div", {class:"row"}, chip("late", `متأخر ${fmtDur(ev.late)}`)));
      if (!isOut && ev.off) body.append(h("div", {class:"note", text:"النهارده إجازة الفرع الأسبوعية. لو سجّلت، الوقت كله هيتحسب إضافي."}));
      if (br && br.lat != null) body.append(h("div", {class:"dist", text:`التسجيل مسموح من جوه الفرع بس (في حدود ${br.radius} متر).`}));
    } else {
      body.append(h("div", {class:"row"}, chip(ev.status), h("span", {class:"small muted", text:`اشتغلت ${fmtDur(ev.worked)}`}),
        ev.ot ? chip("ok", `إضافي ${fmtDur(ev.ot)}`) : null, ev.early ? chip("late", `انصراف بدري ${fmtDur(ev.early)}`) : null));
    }
  }
  body.append(msg);
  box.replaceChildren(h("div", {class:"card"}, head, h("div", {class:"slots"}, slot("الحضور", day ? day.inMin : null), slot("الانصراف", day ? day.outMin : null)), body));
}
function getPos() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({lat:p.coords.latitude, lng:p.coords.longitude, acc:Math.round(p.coords.accuracy)}),
      () => res(null), {enableHighAccuracy:true, timeout:15000, maximumAge:0});
  });
}
function fillMonth() {
  if (!$("myStats") || !S.my) return;
  const now = cairo(), ym = now.date.slice(0, 7), br = myBranch(), ls = leaveSet(S.my.leaves);
  const byDate = {}; S.my.days.forEach(d => byDate[d.date] = d);
  const rows = datesBetween(ym + "-01", now.date).map(d => evalDay(d, byDate[d], br, ls, now));
  const t = summarize(rows, now);
  $("monthName").textContent = fmtDate(ym + "-01", {weekday:undefined, day:undefined, month:"long", year:"numeric"});
  $("myStats").replaceChildren(...[["أيام حضور", t.present], ["غياب", t.abs], ["مرات تأخير", t.lateN], ["إجمالي التأخير", fmtDur(t.lateMin)], ["إضافي", fmtDur(t.ot)], ["إجازات", t.leave]]
    .map(([a, b]) => h("div", {class:"stat"}, h("b", {text:String(b)}), h("span", {text:a}))));
  const list = rows.slice().reverse().slice(0, 14);
  $("myDays").replaceChildren(...(list.length ? list.map(r => h("div", {class:"item"},
    h("div", {class:"main"}, h("span", {text:fmtDate(r.date)}), h("span", {class:"small muted num", text:r.inMin != null ? `${fmtT(r.inMin)} ← ${fmtT(r.outMin)}` : " "})), chip(r.status)))
    : [h("div", {class:"empty-state", text:"أيامك هتظهر هنا أول ما تسجّل."})]));
  const lv = S.my.leaves.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  $("myLeaves").replaceChildren(...(lv.length ? lv.map(l => h("div", {class:"item"},
    h("div", {class:"main"}, h("span", {text:`${LEAVE_TYPES[l.type] || l.type} · ${l.from === l.to ? fmtDate(l.from) : fmtDate(l.from, {weekday:undefined}) + " – " + fmtDate(l.to, {weekday:undefined})}`}), l.reason ? h("span", {class:"small muted", text:l.reason}) : null),
    chip(l.status === "approved" ? "ok" : l.status === "rejected" ? "abs" : "wait", l.status === "approved" ? "اتوافق" : l.status === "rejected" ? "اترفض" : "مستني الرد")))
    : [h("div", {class:"empty-state", text:"مفيش طلبات لسه."})]));
}
function leaveForm() {
  const msg = msgEl(), today = cairo().date;
  const f = h("form", {class:"panel"},
    h("h2", {text:"طلب إجازة أو إذن"}),
    h("div", {class:"grid2"},
      h("label", {class:"f"}, "النوع", h("select", {id:"lType"}, Object.entries(LEAVE_TYPES).map(([k, t]) => h("option", {value:k}, t)))),
      h("label", {class:"f"}, "من يوم", h("input", {id:"lFrom", type:"date", required:true, value:today})),
      h("label", {class:"f"}, "إلى يوم", h("input", {id:"lTo", type:"date", required:true, value:today}))),
    h("label", {class:"f"}, "السبب (اختياري)", h("textarea", {id:"lReason", maxlength:"300"})),
    h("div", {class:"row"}, h("button", {class:"btn primary", type:"submit", text:"إرسال الطلب"})), msg);
  f.addEventListener("submit", async ev => {
    ev.preventDefault(); const from = $("lFrom").value, to = $("lTo").value;
    if (!from || !to || to < from) return setMsg(msg, "تاريخ النهاية لازم يكون بعد تاريخ البداية أو نفس اليوم.");
    const b = f.querySelector("button"); b.disabled = true;
    try { await api("leave", {type:$("lType").value, from, to, reason:$("lReason").value}); setMsg(msg, "اتبعت للمدير.", true); $("lReason").value = ""; loadMy(); }
    catch (e) { setMsg(msg, e.message); }
    b.disabled = false;
  });
  return f;
}

/* ---------- admin ---------- */
const TABS = [["today", "النهارده"], ["staff", "الموظفين"], ["leaves", "الإجازات"], ["report", "التقرير الشهري"], ["settings", "الفروع والمواعيد"]];
let refreshTimer = null;
function renderAdmin() {
  $("view").replaceChildren(h("div", {class:"wrap", style:"gap:14px"}, h("nav", {class:"tabs", role:"tablist", id:"tabs"}), h("div", {id:"tabBody"})));
  renderTabs(); openTab(S.tab);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (S.mode === "admin" && S.tab === "today" && document.visibilityState === "visible") loadAdmin(); }, 60000);
}
function renderTabs() {
  const d = S.ad, pend = d ? d.employees.filter(e => e.status === "pending").length : 0, lp = d ? d.leaves.filter(l => l.status === "pending").length : 0;
  $("tabs").replaceChildren(...TABS.map(([k, t]) => h("button", {role:"tab", "aria-selected":String(S.tab === k), onclick:() => openTab(k)}, t,
    k === "staff" && pend ? h("span", {class:"badge", text:String(pend)}) : null, k === "leaves" && lp ? h("span", {class:"badge", text:String(lp)}) : null)));
}
async function openTab(k) {
  S.tab = k; renderTabs();
  const box = $("tabBody");
  if (k === "report") return box.replaceChildren(tabReport());
  if (!S.ad) { box.replaceChildren(h("div", {class:"panel"}, h("div", {class:"empty-state", text:"جاري تحميل البيانات…"}))); await loadAdmin(); if (S.ad && S.tab === "settings") drawTab(); return; }
  drawTab();
}
async function loadAdmin() {
  try { S.ad = await api("adminToday"); S.ad.at = new Date(); S.me.branches = S.ad.branches; }
  catch (e) { if ($("tabBody")) $("tabBody").replaceChildren(h("div", {class:"panel"}, h("div", {class:"empty-state", text:e.message}))); return; }
  if (S.mode === "admin" && $("tabs")) { renderTabs(); if (S.tab !== "report" && S.tab !== "settings") drawTab(); }
}
function drawTab() {
  const box = $("tabBody"), k = S.tab;
  if (k === "today") box.replaceChildren(tabToday());
  else if (k === "staff") box.replaceChildren(tabStaff());
  else if (k === "leaves") box.replaceChildren(tabLeaves());
  else if (k === "settings") box.replaceChildren(tabSettings());
}
function branchSelect(id, val, withAll, onchange) {
  return h("select", {id, onchange, style:"width:auto"}, withAll ? h("option", {value:""}, "كل الفروع") : null,
    S.ad.branches.map(b => { const o = h("option", {value:b.id}, b.name); if (b.id === val) o.selected = true; return o; }));
}
function tabToday() {
  const d = S.ad, now = d.now;
  const active = d.employees.filter(e => e.status === "active" && (!S.todayFilter || e.branchId === S.todayFilter));
  const rows = active.map(e => {
    const br = branchOf(d.branches, e.branchId), day = d.today.find(x => x.email === e.email);
    return {e, br, day, ev:evalDay(now.date, day, br, leaveSet(d.leaves.filter(l => l.email === e.email)), now)};
  });
  const cnt = {in:0, late:0, abs:0, leave:0, wait:0};
  rows.forEach(r => { const s = r.ev.status; if (r.ev.inMin != null) cnt.in++; if (s in cnt) cnt[s]++; });
  const order = {abs:0, late:1, wait:2, open:3, noout:3, ok:4, leave:5, off:6};
  rows.sort((a, b) => (order[a.ev.status] ?? 9) - (order[b.ev.status] ?? 9));
  return h("div", {class:"panel"},
    h("div", {class:"spread"}, h("div", null, h("h2", {text:fmtDate(now.date)}), h("span", {class:"small muted", text:`آخر تحديث ${fmtT(cairo(d.at).min)} · بيتحدّث كل دقيقة`})),
      h("div", {class:"row"}, branchSelect("todayBranch", S.todayFilter, true, e => { S.todayFilter = e.target.value; drawTab(); }), h("button", {class:"btn sm", text:"تحديث", onclick:loadAdmin}))),
    h("div", {class:"stats"}, [["حضروا", cnt.in], ["متأخرين", cnt.late], ["غايبين", cnt.abs], ["إجازة", cnt.leave], ["لسه", cnt.wait]].map(([a, b]) => h("div", {class:"stat"}, h("b", {text:String(b)}), h("span", {text:a})))),
    rows.length ? h("div", {class:"tablewrap"}, h("table", null,
      h("thead", null, h("tr", null, ["الموظف", "الفرع", "الحضور", "الانصراف", "المسافة", "الحالة"].map(x => h("th", {text:x})))),
      h("tbody", null, rows.map(r => h("tr", null,
        h("td", {class:"name", text:r.e.name}), h("td", {text:r.br ? r.br.name : "—"}),
        h("td", {class:"mono", text:fmtT(r.ev.inMin)}), h("td", {class:"mono", text:fmtT(r.ev.outMin)}),
        h("td", {class:"mono", text:r.day && r.day.inDist != null ? `${r.day.inDist} م` : "—"}),
        h("td", null, chip(r.ev.status, r.ev.status === "late" ? `متأخر ${fmtDur(r.ev.late)}` : null)))))))
    : h("div", {class:"empty-state", text:"لسه مفيش موظفين متفعّلين. ابعت لينك الصفحة للموظفين، وكل واحد يدخل بجيميله ويسجّل بياناته، وبعدها وافق عليهم من تبويب الموظفين."}));
}
async function setEmp(email, patch, btn) {
  if (btn) btn.disabled = true;
  try { await api("setEmployee", Object.assign({email}, patch)); await loadAdmin(); }
  catch (e) { if (btn) { btn.disabled = false; btn.textContent = "فشل، جرّب تاني"; } }
}
function tabStaff() {
  const d = S.ad, pend = d.employees.filter(e => e.status === "pending"), rest = d.employees.filter(e => e.status !== "pending");
  const empLine = e => h("div", {class:"main"}, h("span", {style:"font-weight:600", text:e.name}), h("span", {class:"small muted mono", dir:"ltr", style:"text-align:right", text:[e.email, e.phone].filter(Boolean).join(" · ")}));
  return h("div", {class:"wrap", style:"gap:14px"},
    h("div", {class:"panel"}, h("h2", {text:"طلبات انضمام"}),
      pend.length ? h("div", {class:"list"}, pend.map(e => {
        const sel = branchSelect("pb-" + e.email, e.branchId, false);
        const b = h("button", {class:"btn primary sm", text:"موافقة", onclick:() => setEmp(e.email, {status:"active", branchId:sel.value}, b)});
        const r = h("button", {class:"btn sm danger", text:"رفض", onclick:() => setEmp(e.email, {status:"inactive"}, r)});
        return h("div", {class:"item"}, empLine(e), h("div", {class:"row"}, sel, b, r));
      })) : h("div", {class:"empty-state", text:"مفيش طلبات جديدة. أي موظف يدخل بجيميله ويسجّل بياناته هيظهر هنا."})),
    h("div", {class:"panel"}, h("h2", {text:`الموظفين (${rest.length})`}),
      rest.length ? h("div", {class:"list"}, rest.map(e => {
        const act = e.status === "active";
        const sel = branchSelect("sb-" + e.email, e.branchId, false, ev => setEmp(e.email, {branchId:ev.target.value}));
        const tg = h("button", {class:"btn sm" + (act ? " danger" : ""), text:act ? "إيقاف" : "تفعيل", onclick:() => setEmp(e.email, {status:act ? "inactive" : "active"}, tg)});
        return h("div", {class:"item"}, empLine(e), h("div", {class:"row"}, act ? null : chip("off", "موقوف"), sel, tg));
      })) : h("div", {class:"empty-state", text:"لسه مفيش حد اتوافق عليه."})));
}
function tabLeaves() {
  const L = S.ad.leaves.slice().sort((a, b) => ((a.status === "pending") === (b.status === "pending") ? (b.createdAt || "").localeCompare(a.createdAt || "") : (a.status === "pending" ? -1 : 1)));
  return h("div", {class:"panel"}, h("div", {class:"spread"}, h("h2", {text:"طلبات الإجازات والأذونات"}), h("button", {class:"btn sm", text:"تحديث", onclick:loadAdmin})),
    L.length ? h("div", {class:"list"}, L.map(l => {
      const n = datesBetween(l.from, l.to).length;
      let act;
      if (l.status === "pending") {
        const a = h("button", {class:"btn primary sm", text:"موافقة"}), r = h("button", {class:"btn sm danger", text:"رفض"});
        const decide = async st => { a.disabled = r.disabled = true; try { await api("decideLeave", {id:l.id, status:st}); await loadAdmin(); } catch (_) { a.disabled = r.disabled = false; } };
        a.onclick = () => decide("approved"); r.onclick = () => decide("rejected");
        act = h("div", {class:"row"}, a, r);
      } else act = chip(l.status === "approved" ? "ok" : "abs", l.status === "approved" ? "اتوافق" : "اترفض");
      return h("div", {class:"item"}, h("div", {class:"main"},
        h("span", null, h("b", {text:l.name}), " · ", LEAVE_TYPES[l.type] || l.type, " · ", h("span", {class:"num", text:`${n} ${n === 1 ? "يوم" : "أيام"}`})),
        h("span", {class:"small muted", text:l.from === l.to ? fmtDate(l.from) : `${fmtDate(l.from)} – ${fmtDate(l.to)}`}),
        l.reason ? h("span", {class:"small", text:l.reason}) : null), act);
    })) : h("div", {class:"empty-state", text:"مفيش طلبات إجازة."}));
}
function tabReport() {
  const now = cairo(), out = h("div", null, h("div", {class:"empty-state", text:"اختار الشهر واضغط \"اعمل التقرير\"."}));
  const m = h("input", {id:"repMonth", type:"month", value:now.date.slice(0, 7)});
  const sel = h("select", {id:"repBranch"}, h("option", {value:""}, "كل الفروع"), (S.me.branches || []).map(b => h("option", {value:b.id}, b.name)));
  const go = h("button", {class:"btn primary", text:"اعمل التقرير"});
  go.onclick = async () => {
    go.disabled = true; out.replaceChildren(h("div", {class:"empty-state", text:"بنجمع البيانات…"}));
    try { buildReport(await api("adminMonth", {ym:m.value}), m.value, sel.value, out); }
    catch (e) { out.replaceChildren(h("div", {class:"empty-state", text:e.message})); }
    go.disabled = false;
  };
  return h("div", {class:"panel"}, h("h2", {text:"التقرير الشهري للمرتبات"}),
    h("div", {class:"grid2"}, h("label", {class:"f"}, "الشهر", m), h("label", {class:"f"}, "الفرع", sel), h("div", {class:"f", style:"justify-content:flex-end"}, go)), out);
}
function buildReport(d, ym, bf, out) {
  const now = d.now, start = ym + "-01", end = monthEnd(ym), last = end < now.date ? end : now.date;
  if (start > now.date) return out.replaceChildren(h("div", {class:"empty-state", text:"الشهر ده لسه مجاش."}));
  const emps = d.employees.filter(e => e.status !== "pending" && (!bf || e.branchId === bf));
  const rows = emps.map(e => {
    const br = branchOf(d.branches, e.branchId), byDate = {};
    d.days.filter(x => x.email === e.email).forEach(x => byDate[x.date] = x);
    const t = summarize(datesBetween(start, last).map(dt => evalDay(dt, byDate[dt], br, leaveSet(d.leaves.filter(l => l.email === e.email)), now)), now);
    return {name:e.name, branch:br ? br.name : "—", t};
  }).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  S.lastReport = {ym, rows};
  if (!rows.length) return out.replaceChildren(h("div", {class:"empty-state", text:"مفيش موظفين في الفرع ده."}));
  const cols = [["الموظف", r => r.name, "name"], ["الفرع", r => r.branch], ["أيام العمل", r => r.t.workdays], ["حضور", r => r.t.present], ["غياب", r => r.t.abs], ["إجازات", r => r.t.leave], ["مرات التأخير", r => r.t.lateN], ["التأخير", r => fmtDur(r.t.lateMin)], ["انصراف بدري", r => fmtDur(r.t.early)], ["إضافي", r => fmtDur(r.t.ot)], ["ساعات العمل", r => fmtDur(r.t.worked)], ["بدون انصراف", r => r.t.noout]];
  out.replaceChildren(h("div", {class:"wrap", style:"gap:10px"},
    h("div", {class:"spread"}, h("span", {class:"small muted", text:`من ${fmtDate(start, {weekday:undefined})} لحد ${fmtDate(last, {weekday:undefined})}`}), h("button", {class:"btn sm", text:"تنزيل Excel (CSV)", onclick:exportCsv})),
    h("div", {class:"tablewrap"}, h("table", null, h("thead", null, h("tr", null, cols.map(c => h("th", {text:c[0]})))),
      h("tbody", null, rows.map(r => h("tr", null, cols.map(c => h("td", {class:c[2] || "", text:String(c[1](r))}))))))),
    h("p", {class:"small muted", text:"التأخير بيتحسب من ميعاد بداية الدوام لو الموظف جه بعد فترة السماح. أي شغل في يوم الإجازة الأسبوعية بيتحسب إضافي. البيانات الخام كلها موجودة في الشيت."})));
}
function exportCsv() {
  const r = S.lastReport; if (!r) return;
  const head = ["الموظف", "الفرع", "أيام العمل", "حضور", "غياب", "إجازات", "مرات التأخير", "دقائق التأخير", "دقائق الانصراف البدري", "دقائق الإضافي", "ساعات العمل", "أيام بدون انصراف"];
  const esc = v => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head].concat(r.rows.map(x => [x.name, x.branch, x.t.workdays, x.t.present, x.t.abs, x.t.leave, x.t.lateN, x.t.lateMin, x.t.early, x.t.ot, (x.t.worked / 60).toFixed(2), x.t.noout]));
  const blob = new Blob(["﻿" + lines.map(l => l.map(esc).join(",")).join("\r\n")], {type:"text/csv;charset=utf-8"});
  const a = h("a", {href:URL.createObjectURL(blob), download:`attendance-${r.ym}.csv`}); document.body.append(a); a.click(); a.remove();
}
function tabSettings() {
  const list = S.ad.branches.map(b => Object.assign({}, b, {off:(b.off || []).slice()}));
  const msg = msgEl(), box = h("div", {class:"wrap", style:"gap:12px"});
  function draw() {
    box.replaceChildren(...list.map((b, i) => {
      const locTxt = h("span", {class:"small muted mono", text:b.lat != null ? `${(+b.lat).toFixed(5)}, ${(+b.lng).toFixed(5)}` : "مفيش موقع متحدد، يعني التسجيل مسموح من أي مكان"});
      const locBtn = h("button", {class:"btn sm", type:"button", text:"استخدم موقعي الحالي"});
      locBtn.onclick = async () => { locBtn.disabled = true; locBtn.textContent = "جاري التحديد…"; const p = await getPos();
        if (p) { b.lat = +p.lat.toFixed(6); b.lng = +p.lng.toFixed(6); draw(); setMsg(msg, `اتحدد موقع ${b.name || "الفرع"} (دقة ${p.acc} متر). متنساش تدوس حفظ.`, true); }
        else { locBtn.disabled = false; locBtn.textContent = "استخدم موقعي الحالي"; setMsg(msg, "مقدرناش نحدد موقعك. افتح الـ GPS واسمح للمتصفح."); } };
      return h("div", {class:"branchbox"},
        h("div", {class:"grid2"},
          h("label", {class:"f"}, "اسم الفرع", h("input", {id:"bn" + i, value:b.name || "", oninput:e => b.name = e.target.value})),
          h("label", {class:"f"}, "بداية الدوام", h("input", {id:"bs" + i, type:"time", value:b.start || "09:00", oninput:e => b.start = e.target.value})),
          h("label", {class:"f"}, "نهاية الدوام", h("input", {id:"be" + i, type:"time", value:b.end || "17:00", oninput:e => b.end = e.target.value})),
          h("label", {class:"f"}, "فترة السماح (دقيقة)", h("input", {id:"bg" + i, type:"number", min:"0", max:"120", value:String(b.grace ?? 15), oninput:e => b.grace = Math.max(0, +e.target.value || 0)})),
          h("label", {class:"f"}, "نطاق الموقع (متر)", h("input", {id:"br" + i, type:"number", min:"30", max:"2000", value:String(b.radius || 150), oninput:e => b.radius = +e.target.value || 150}))),
        h("div", {class:"f"}, "أيام الإجازة الأسبوعية", h("div", {class:"days"}, WD.map((dn, wd) => h("label", null,
          h("input", {type:"checkbox", id:`bo${i}-${wd}`, checked:b.off.includes(wd), onchange:e => { if (e.target.checked) { if (!b.off.includes(wd)) b.off.push(wd); } else b.off = b.off.filter(x => x !== wd); }}), dn)))),
        h("div", {class:"f"}, "موقع الفرع", h("div", {class:"row"}, locBtn, b.lat != null ? h("button", {class:"btn sm", type:"button", text:"إلغاء الموقع", onclick:() => { b.lat = b.lng = null; draw(); }}) : null), locTxt),
        h("div", null, h("button", {class:"btn sm danger", type:"button", text:"حذف الفرع", onclick:() => { list.splice(i, 1); draw(); }})));
    }), list.length ? "" : h("div", {class:"empty-state", text:"ضيف أول فرع عشان الموظفين يقدروا يختاروه."}));
  }
  draw();
  const save = h("button", {class:"btn primary", text:"حفظ"});
  save.onclick = async () => {
    if (list.some(b => !String(b.name || "").trim())) return setMsg(msg, "كل فرع لازم يكون له اسم.");
    if (list.some(b => hm(b.end) <= hm(b.start))) return setMsg(msg, "نهاية الدوام لازم تكون بعد بدايته.");
    save.disabled = true;
    try { S.ad.branches = S.me.branches = await api("saveBranches", {branches:list}); setMsg(msg, "اتحفظ.", true); }
    catch (e) { setMsg(msg, e.message); }
    save.disabled = false;
  };
  return h("div", {class:"panel"}, h("h2", {text:"الفروع ومواعيد الدوام"}),
    h("p", {class:"small muted", text:"المواعيد دي هي اللي بيتحسب عليها التأخير والإضافي، والوقت كله بتوقيت القاهرة. عشان تحدد موقع الفرع، افتح الصفحة دي وانت واقف جوه الفرع واضغط \"استخدم موقعي الحالي\"."}), box,
    h("div", {class:"row"}, h("button", {class:"btn", type:"button", text:"+ إضافة فرع", onclick:() => { list.push({id:"", name:"", start:"09:00", end:"17:00", grace:15, off:[5], lat:null, lng:null, radius:150}); draw(); }}), save), msg);
}

/* ---------- boot ---------- */
function boot() {
  $("logout").onclick = signOut;
  if (!CFG.CLIENT_ID || CFG.CLIENT_ID.startsWith("PUT_") || !CFG.API_URL || CFG.API_URL.startsWith("PUT_"))
    return notice("السيستم لسه متظبطش", "لازم تكتب Client ID ورابط الـ API في ملف config.js. الخطوات موجودة في README.md.");
  whenGoogle(() => {
    google.accounts.id.initialize({client_id:CFG.CLIENT_ID, auto_select:true, cancel_on_tap_outside:false,
      callback:r => { saveToken(r.credential); start(); }});
    const t = loadToken();
    if (t) { S.token = t; start(); } else showLogin();
  });
  setInterval(() => {
    const c = $("clock"); if (c) { const n = cairo(); c.textContent = `${n.h}:${n.m}:${n.s}`; }
    if (S.token && jwtExp(S.token) < Date.now()) signOut();
  }, 1000);
}
boot();
})();
