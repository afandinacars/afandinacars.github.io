/**
 * حضور أفندينا موتورز — الخادم (Google Apps Script مربوط بـ Google Sheet)
 *
 * 1) الصق Client ID بتاع Google هنا:
 */
const CLIENT_ID = 'PUT_YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com';

const TZ = 'Africa/Cairo';
const SHEETS = {
  Settings:   ['key', 'value'],
  Branches:   ['id', 'name', 'start', 'end', 'grace', 'off', 'lat', 'lng', 'radius'],
  Employees:  ['email', 'name', 'phone', 'branchId', 'status', 'createdAt'],
  Attendance: ['date', 'email', 'name', 'branchId', 'inTime', 'outTime', 'inMin', 'outMin',
               'inLat', 'inLng', 'inDist', 'outLat', 'outLng', 'outDist'],
  Leaves:     ['id', 'email', 'name', 'type', 'from', 'to', 'reason', 'status', 'createdAt']
};
const LEAVE_TYPES = ['annual', 'casual', 'sick', 'unpaid', 'permission'];

/* ---------- شغّل الدالة دي مرة واحدة من المحرر ---------- */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SHEETS).forEach(function (name) {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    const head = SHEETS[name];
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.getRange(1, 1, s.getMaxRows(), head.length).setNumberFormat('@'); // نص عادي، عشان التواريخ متتحولش
    s.setFrozenRows(1);
  });
  const settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() < 2) {
    settings.appendRow(['admins', Session.getActiveUser().getEmail()]);
  }
  const br = ss.getSheetByName('Branches');
  if (br.getLastRow() < 2) {
    br.appendRow(['b10ram', 'العاشر من رمضان', '09:00', '17:00', '15', '5', '', '', '150']);
    br.appendRow(['bnasr', 'مدينة نصر', '09:00', '17:00', '15', '5', '', '', '150']);
  }
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/* ---------- HTTP ---------- */
function doGet() { return json({ ok: true, service: 'afandina-attendance' }); }

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = verify(req.token);
    const data = route(String(req.action || ''), req, user);
    return json({ ok: true, data: data });
  } catch (x) {
    return json({ ok: false, code: x.code || 'error', message: x.code ? x.message : 'حصلت مشكلة في السيرفر' });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function fail(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

/* ---------- التحقق من حساب جوجل ---------- */
function verify(token) {
  if (!token) throw fail('auth', 'سجّل دخول الأول');
  const key = 't' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw fail('auth', 'انتهت الجلسة، سجّل دخول تاني');
  const p = JSON.parse(r.getContentText());
  if (p.aud !== CLIENT_ID || String(p.email_verified) !== 'true') throw fail('auth', 'الحساب ده مش مسموح');
  const left = Number(p.exp) - Math.floor(Date.now() / 1000);
  if (left <= 0) throw fail('auth', 'انتهت الجلسة، سجّل دخول تاني');
  const u = { email: String(p.email).toLowerCase(), name: p.name || '' };
  cache.put(key, JSON.stringify(u), Math.max(1, Math.min(600, left)));
  return u;
}

/* ---------- أدوات الشيت ---------- */
function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function str(v, kind) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, kind === 'time' ? 'HH:mm' : 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}
function rows(name) {
  const s = sheet(name);
  const v = s.getDataRange().getValues();
  const head = v.shift() || [];
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = str(r[j], /time$|^start$|^end$/i.test(h) ? 'time' : 'date'); });
    return o;
  });
}
function setCells(name, rowNum, obj) {
  const s = sheet(name), head = SHEETS[name];
  Object.keys(obj).forEach(function (k) {
    const c = head.indexOf(k);
    if (c >= 0) s.getRange(rowNum, c + 1).setValue(obj[k] == null ? '' : String(obj[k]));
  });
}
function append(name, obj) {
  sheet(name).appendRow(SHEETS[name].map(function (h) { return obj[h] == null ? '' : String(obj[h]); }));
}
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function now() {
  const d = new Date();
  const hhmm = Utilities.formatDate(d, TZ, 'HH:mm');
  return { date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: hhmm,
           min: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), iso: d.toISOString() };
}
function admins() {
  const r = rows('Settings').filter(function (x) { return x.key === 'admins'; })[0];
  return r ? r.value.split(/[,\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(String) : [];
}
function isAdmin(email) { return admins().indexOf(email) >= 0; }
function needAdmin(u) { if (!isAdmin(u.email)) throw fail('forbidden', 'الصفحة دي للإدارة بس'); }

function branches() {
  return rows('Branches').map(function (b) {
    return { id: b.id, name: b.name, start: b.start || '09:00', end: b.end || '17:00',
      grace: Number(b.grace) || 0,
      off: String(b.off || '').split(/[,\s]+/).filter(String).map(Number),
      lat: b.lat === '' ? null : Number(b.lat), lng: b.lng === '' ? null : Number(b.lng),
      radius: Number(b.radius) || 150 };
  });
}
function employee(email) {
  return rows('Employees').filter(function (e) { return e.email.toLowerCase() === email; })[0] || null;
}
function pubEmp(e) { return e ? { email: e.email, name: e.name, phone: e.phone, branchId: e.branchId, status: e.status } : null; }
function pubDay(a) {
  return { date: a.date, email: a.email, name: a.name, branchId: a.branchId, inTime: a.inTime, outTime: a.outTime,
    inMin: a.inMin === '' ? null : Number(a.inMin), outMin: a.outMin === '' ? null : Number(a.outMin),
    inDist: a.inDist === '' ? null : Number(a.inDist), outDist: a.outDist === '' ? null : Number(a.outDist) };
}
function pubLeave(l) {
  return { id: l.id, email: l.email, name: l.name, type: l.type, from: l.from, to: l.to,
           reason: l.reason, status: l.status || 'pending', createdAt: l.createdAt };
}
function meters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
function clean(s, max) { return String(s == null ? '' : s).replace(/^[=+\-@]+/, '').trim().slice(0, max); }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }

/* ---------- العمليات ---------- */
function route(action, q, u) {
  switch (action) {
    case 'me': {
      return { email: u.email, googleName: u.name, isAdmin: isAdmin(u.email),
               employee: pubEmp(employee(u.email)), branches: branches(), now: now() };
    }
    case 'register': {
      const name = clean(q.name, 60), phone = clean(q.phone, 20), branchId = clean(q.branchId, 40);
      if (name.length < 3) throw fail('invalid', 'اكتب اسمك بالكامل');
      return withLock(function () {
        if (employee(u.email)) throw fail('exists', 'انت مسجّل بالفعل');
        append('Employees', { email: u.email, name: name, phone: phone, branchId: branchId,
                              status: 'pending', createdAt: now().iso });
        return pubEmp(employee(u.email));
      });
    }
    case 'punch': {
      const emp = employee(u.email);
      if (!emp || emp.status !== 'active') throw fail('forbidden', 'حسابك لسه متفعّلش من المدير');
      const br = branches().filter(function (b) { return b.id === emp.branchId; })[0];
      let dist = null;
      const lat = q.lat == null ? null : Number(q.lat), lng = q.lng == null ? null : Number(q.lng);
      if (br && br.lat != null && br.lng != null) {
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng))
          throw fail('gps', 'لازم تفتح الموقع (GPS) عشان تسجّل');
        dist = Math.round(meters(lat, lng, br.lat, br.lng));
        const acc = Math.min(Number(q.acc) || 0, 50);
        if (dist > br.radius + acc)
          throw fail('far', 'انت بعيد عن الفرع حوالي ' + dist + ' متر. سجّل وانت جوه الفرع.');
      } else if (lat != null && lng != null && br && br.lat != null) {
        dist = Math.round(meters(lat, lng, br.lat, br.lng));
      }
      return withLock(function () {
        const t = now();
        const today = rows('Attendance').filter(function (a) { return a.date === t.date && a.email === u.email; })[0];
        if (!today) {
          append('Attendance', { date: t.date, email: u.email, name: emp.name, branchId: emp.branchId,
            inTime: t.time, inMin: t.min, inLat: lat, inLng: lng, inDist: dist });
          return { kind: 'in', time: t.time };
        }
        if (today.outTime) throw fail('done', 'انت سجّلت حضور وانصراف النهارده خلاص');
        if (t.min - Number(today.inMin) < 1) throw fail('too_soon', 'استنى دقيقة قبل ما تسجّل الانصراف');
        setCells('Attendance', today._row, { outTime: t.time, outMin: t.min, outLat: lat, outLng: lng, outDist: dist });
        return { kind: 'out', time: t.time };
      });
    }
    case 'myMonth': {
      const ym = String(q.ym || now().date.slice(0, 7));
      return {
        days: rows('Attendance').filter(function (a) { return a.email === u.email && a.date.slice(0, 7) === ym; }).map(pubDay),
        leaves: rows('Leaves').filter(function (l) { return l.email === u.email; }).map(pubLeave),
        now: now()
      };
    }
    case 'leave': {
      const emp = employee(u.email);
      if (!emp || emp.status !== 'active') throw fail('forbidden', 'حسابك لسه متفعّلش');
      const type = LEAVE_TYPES.indexOf(q.type) >= 0 ? q.type : 'annual';
      if (!isDate(q.from) || !isDate(q.to) || q.to < q.from) throw fail('invalid', 'التواريخ مش مظبوطة');
      const days = (new Date(q.to) - new Date(q.from)) / 864e5 + 1;
      if (days > 60) throw fail('invalid', 'الطلب الواحد أقصاه 60 يوم');
      return withLock(function () {
        append('Leaves', { id: Utilities.getUuid().slice(0, 8), email: u.email, name: emp.name, type: type,
          from: q.from, to: q.to, reason: clean(q.reason, 300), status: 'pending', createdAt: now().iso });
        return true;
      });
    }

    /* ---- الإدارة ---- */
    case 'adminToday': {
      needAdmin(u);
      const t = now();
      return { now: t, branches: branches(), employees: rows('Employees').map(pubEmp),
        today: rows('Attendance').filter(function (a) { return a.date === t.date; }).map(pubDay),
        leaves: rows('Leaves').map(pubLeave) };
    }
    case 'adminMonth': {
      needAdmin(u);
      const ym = String(q.ym || '');
      if (!/^\d{4}-\d{2}$/.test(ym)) throw fail('invalid', 'اختار الشهر');
      return { now: now(), branches: branches(), employees: rows('Employees').map(pubEmp),
        days: rows('Attendance').filter(function (a) { return a.date.slice(0, 7) === ym; }).map(pubDay),
        leaves: rows('Leaves').filter(function (l) { return l.status === 'approved'; }).map(pubLeave) };
    }
    case 'setEmployee': {
      needAdmin(u);
      return withLock(function () {
        const e = employee(String(q.email || '').toLowerCase());
        if (!e) throw fail('missing', 'الموظف مش موجود');
        const patch = {};
        if (['pending', 'active', 'inactive'].indexOf(q.status) >= 0) patch.status = q.status;
        if (q.branchId != null) patch.branchId = clean(q.branchId, 40);
        setCells('Employees', e._row, patch);
        return true;
      });
    }
    case 'decideLeave': {
      needAdmin(u);
      if (['approved', 'rejected'].indexOf(q.status) < 0) throw fail('invalid', 'قرار غير معروف');
      return withLock(function () {
        const l = rows('Leaves').filter(function (x) { return x.id === q.id; })[0];
        if (!l) throw fail('missing', 'الطلب مش موجود');
        setCells('Leaves', l._row, { status: q.status });
        return true;
      });
    }
    case 'saveBranches': {
      needAdmin(u);
      const list = (q.branches || []).slice(0, 30).map(function (b) {
        const ok = function (s) { return /^\d{2}:\d{2}$/.test(s) ? s : null; };
        return { id: clean(b.id, 40) || ('b' + Utilities.getUuid().slice(0, 6)), name: clean(b.name, 60),
          start: ok(b.start) || '09:00', end: ok(b.end) || '17:00', grace: Math.max(0, Math.min(120, Number(b.grace) || 0)),
          off: (b.off || []).map(Number).filter(function (n) { return n >= 0 && n <= 6; }).join(','),
          lat: b.lat == null || b.lat === '' ? '' : Number(b.lat), lng: b.lng == null || b.lng === '' ? '' : Number(b.lng),
          radius: Math.max(30, Math.min(2000, Number(b.radius) || 150)) };
      });
      if (list.some(function (b) { return !b.name; })) throw fail('invalid', 'كل فرع لازم يكون له اسم');
      return withLock(function () {
        const s = sheet('Branches');
        if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, SHEETS.Branches.length).clearContent();
        list.forEach(function (b) { append('Branches', b); });
        return branches();
      });
    }
  }
  throw fail('invalid', 'عملية غير معروفة');
}
