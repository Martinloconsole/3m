'use strict';

/* ============================================================
   3M · 3 Master Tasks
   ============================================================ */

// Puedes dejar estos valores aquí o cargarlos desde Ajustes dentro de la app.
const CONFIG = {
  SCRIPT_URL: '', // URL de la Web App de Apps Script (termina en /exec)
  TOKEN: '',      // Debe coincidir con SECRET en Code.gs
  CLOSE_HOUR: 22,   // Hora del cierre del día (cuenta regresiva)
  MORNING_HOUR: 8   // Aviso diario "Define tus 3 tareas" (solo en la app Android)
};

const KEY = '3m:v1';
const MAX_HISTORY = 90;
const NOTE_VIEW = new URLSearchParams(location.search).get('view') === 'note';

// Dentro del APK (Capacitor) hay notificaciones nativas; en el navegador se usa la API web.
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const LN = NATIVE ? window.Capacitor.Plugins.LocalNotifications : null;
const BRAND = '#8B5CF6'; // violeta del icono

const $ = (s, r = document) => r.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtLong = d => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const blank = () => Array.from({ length: 3 }, () => ({ text: '', done: false }));

/* ---------------- Estado ---------------- */
const fresh = () => ({
  date: todayStr(),
  tasks: blank(),
  history: [], // [{date, tasks:[{text,done}], synced}]
  settings: { url: CONFIG.SCRIPT_URL, token: CONFIG.TOKEN, notify: false }
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.tasks) && s.tasks.length === 3) {
      const f = fresh();
      return { ...f, ...s, settings: { ...f.settings, ...s.settings } };
    }
  } catch (_) { /* estado corrupto: se empieza de cero */ }
  return fresh();
}

let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };

/* ---------------- Reloj: cuenta regresiva hasta las 22:00 ---------------- */
let clockTimer;
function setNum(id, v) {
  const t = String(v).padStart(2, '0');
  const [a, b] = $('#' + id).children;
  if (a.textContent !== t[0]) a.textContent = t[0];
  if (b.textContent !== t[1]) b.textContent = t[1];
}

function updateClock() {
  clearTimeout(clockTimer);
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), CONFIG.CLOSE_HOUR, 0, 0);
  const total = Math.max(0, Math.ceil((end - now) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  setNum('cH', h); setNum('cM', m); setNum('cS', total % 60);

  const hh = pad(CONFIG.CLOSE_HOUR);
  const cap = total === 0 ? `Pasaron las ${hh}:00. El día se reinicia a medianoche.` : `para el cierre de las ${hh}:00`;
  if ($('#clockCap').textContent !== cap) $('#clockCap').textContent = cap;
  const label = total === 0 ? `Pasaron las ${hh}:00` : `Faltan ${h} horas y ${m} minutos para las ${hh}:00`;
  if ($('#clock').getAttribute('aria-label') !== label) $('#clock').setAttribute('aria-label', label);

  if (!document.hidden) clockTimer = setTimeout(updateClock, 1000 - now.getMilliseconds() + 5);
}

/* ---------------- Cambio de día ---------------- */
function rollover() {
  const t = todayStr();
  if (S.date === t) return false;
  if (S.tasks.some(x => x.text.trim())) {
    const entry = { date: S.date, tasks: S.tasks.map(x => ({ text: x.text.trim(), done: !!x.done })), synced: false };
    S.history = S.history.filter(h => h.date !== entry.date);
    S.history.unshift(entry);
    S.history = S.history.slice(0, MAX_HISTORY);
  }
  S.date = t;
  S.tasks = blank();
  save();
  return true;
}

function tick() {
  if (rollover()) {
    renderAll();
    flush();
    publishSnapshot();
    refreshNotification({ loud: true });
  }
  scheduleMidnight();
}

let midnightTimer;
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const n = new Date();
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
  midnightTimer = setTimeout(tick, Math.min(next - n, 2 ** 31 - 1));
}

/* ---------------- Render: hoy ---------------- */
const ctx = document.createElement('canvas').getContext('2d');
function setStrike(li) {
  const input = $('.txt', li);
  const cs = getComputedStyle(input);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = Math.min(ctx.measureText(input.value).width, input.clientWidth);
  li.style.setProperty('--w', `${w}px`);
}

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function renderTasks() {
  const list = $('#taskList');
  list.textContent = '';
  S.tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'task' + (t.done ? ' done' : '');
    li.innerHTML =
      `<span class="rank" aria-hidden="true">${i + 1}</span>` +
      `<button class="check" aria-label="Marcar tarea ${i + 1} como hecha" aria-pressed="${t.done}">${TICK}</button>` +
      `<div class="txtwrap"><input class="txt" maxlength="90" autocomplete="off" enterkeyhint="done" placeholder="Tarea prioritaria ${i + 1}" aria-label="Tarea ${i + 1}"><i class="strike"></i></div>` +
      `<button class="grip" aria-label="Mover tarea ${i + 1} (flechas arriba y abajo)">${GRIP}</button>`;

    const input = $('.txt', li);
    input.value = t.text;
    input.readOnly = NOTE_VIEW || t.done;

    input.addEventListener('input', () => {
      S.tasks[i].text = input.value;
      if (!input.value.trim() && S.tasks[i].done) { S.tasks[i].done = false; li.classList.remove('done'); }
      setStrike(li);
      renderProgress();
      commit();
    });
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = [...list.querySelectorAll('.txt')].find((el, k) => k > i && !el.value.trim());
      next ? next.focus() : input.blur();
    });

    $('.check', li).addEventListener('click', () => {
      if (!S.tasks[i].text.trim()) { input.focus(); return; }
      S.tasks[i].done = !S.tasks[i].done;
      li.classList.toggle('done', S.tasks[i].done);
      $('.check', li).setAttribute('aria-pressed', S.tasks[i].done);
      input.readOnly = NOTE_VIEW || S.tasks[i].done;
      setStrike(li);
      renderProgress();
      commit();
    });

    list.appendChild(li);
    requestAnimationFrame(() => setStrike(li));
  });
  renderProgress();
}

function renderProgress() {
  const filled = S.tasks.filter(t => t.text.trim()).length;
  const done = S.tasks.filter(t => t.done).length;
  let msg;
  if (!filled) msg = 'Escribe primero lo más importante.';
  else if (done === 3) msg = 'Las 3 hechas. Buen día.';
  else if (filled < 3) msg = `${done} de ${filled} hechas. Te faltan ${3 - filled} por definir.`;
  else msg = `${done} de 3 hechas.`;
  $('#progress').textContent = msg;
}

/* ---------------- Drag & drop (táctil y mouse) ---------------- */
function enableDrag() {
  const list = $('#taskList');

  list.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.grip');
    if (!grip || NOTE_VIEW) return;
    e.preventDefault();

    const items = [...list.children];
    const item = grip.closest('.task');
    const from = items.indexOf(item);
    const pitch = items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top;
    const startY = e.clientY;
    let to = from;

    grip.setPointerCapture(e.pointerId);
    item.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(8);

    const move = ev => {
      const dy = Math.max(-from * pitch, Math.min((items.length - 1 - from) * pitch, ev.clientY - startY));
      item.style.transform = `translateY(${dy}px)`;
      to = Math.round(from + dy / pitch);
      items.forEach((el, k) => {
        if (el === item) return;
        let shift = 0;
        if (from < to && k > from && k <= to) shift = -pitch;
        if (from > to && k < from && k >= to) shift = pitch;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      item.classList.remove('dragging');
      item.style.transform = `translateY(${(to - from) * pitch}px)`;
      setTimeout(() => {
        if (to !== from) {
          const [moved] = S.tasks.splice(from, 1);
          S.tasks.splice(to, 0, moved);
          commit();
        }
        renderTasks();
      }, 230);
    };

    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });

  // Accesibilidad: mover con el teclado
  list.addEventListener('keydown', e => {
    const grip = e.target.closest('.grip');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = [...list.children].indexOf(grip.closest('.task'));
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j > 2) return;
    [S.tasks[i], S.tasks[j]] = [S.tasks[j], S.tasks[i]];
    commit();
    renderTasks();
    list.children[j].querySelector('.grip').focus();
  });
}

/* ---------------- Render: historial ---------------- */
function renderHistory() {
  const ul = $('#historyList');
  ul.textContent = '';
  if (!S.history.length) {
    const p = document.createElement('li');
    p.className = 'empty';
    p.textContent = 'Tus días anteriores aparecerán aquí a medianoche.';
    ul.appendChild(p);
    return;
  }
  S.history.forEach(h => {
    const li = document.createElement('li');
    li.className = 'day';
    const head = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = fmtLong(parseDay(h.date));
    const sync = document.createElement('span');
    sync.className = 'sync' + (h.synced ? ' ok' : '');
    sync.textContent = h.synced ? 'En la hoja' : 'Pendiente de enviar';
    head.append(title, sync);
    const items = document.createElement('ul');
    h.tasks.forEach(t => {
      if (!t.text) return;
      const row = document.createElement('li');
      row.className = t.done ? 'yes' : 'no';
      const mark = document.createElement('span');
      mark.textContent = t.done ? '✓' : '–';
      const txt = document.createElement('span');
      txt.textContent = t.text;
      row.append(mark, txt);
      items.appendChild(row);
    });
    li.append(head, items);
    ul.appendChild(li);
  });
}

function renderAll() {
  $('#dateLabel').textContent = fmtLong(new Date());
  renderTasks();
  renderHistory();
}

/* ---------------- Cambios: guardar + efectos ---------------- */
let commitTimer;
function commit() {
  save();
  clearTimeout(commitTimer);
  commitTimer = setTimeout(() => { publishSnapshot(); refreshNotification(); }, 500);
}

const DATA_URL = () => new URL('widget/data.json', location.href).href;

function snapshot() {
  const lines = S.tasks.map(t => (t.text.trim() ? `${t.done ? '✓' : '○'} ${t.text.trim()}` : '·'));
  return { date: S.date, tasks: S.tasks, t1: lines[0], t2: lines[1], t3: lines[2] };
}

// Guarda los datos donde el service worker pueda leerlos (widget y recordatorios en segundo plano).
async function publishSnapshot() {
  if (!('caches' in window)) return;
  try {
    const c = await caches.open('3m-data');
    await c.put(DATA_URL(), new Response(JSON.stringify(snapshot()), { headers: { 'Content-Type': 'application/json' } }));
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: 'WIDGETS' });
  } catch (_) {}
}

/* ---------------- Notificaciones ---------------- */
function notifBody() {
  const lines = S.tasks
    .map((t, i) => (t.text.trim() ? `${t.done ? '✓' : '○'} ${i + 1}. ${t.text.trim()}` : null))
    .filter(Boolean);
  return lines.length ? lines.join('\n') : 'Define tus 3 tareas de hoy.';
}

async function setupNativeNotifications() {
  try {
    await LN.createChannel({ id: 'foco', name: 'Tus 3 de hoy', description: 'Notificación fija con tus 3 tareas', importance: 2, visibility: 1, vibration: false, lights: true, lightColor: BRAND });
    await LN.createChannel({ id: 'manana', name: 'Aviso diario', description: 'Recordatorio para definir tus 3 tareas', importance: 4, visibility: 1, vibration: true, lights: true, lightColor: BRAND });
  } catch (_) {}
}

async function scheduleMorning() {
  try {
    await LN.cancel({ notifications: [{ id: 2 }] });
    await LN.schedule({ notifications: [{
      id: 2,
      channelId: 'manana',
      title: '3M · Buenos días',
      body: 'Define tus 3 tareas de hoy.',
      smallIcon: 'ic_stat_3m',
      iconColor: BRAND,
      schedule: { on: { hour: CONFIG.MORNING_HOUR, minute: 0 }, allowWhileIdle: true }
    }] });
  } catch (_) {}
}

async function refreshNativeNotification() {
  try {
    const lines = S.tasks.map((t, i) => (t.text.trim() ? `${t.done ? '✓' : '○'} ${i + 1}. ${t.text.trim()}` : `· ${i + 1}. Sin definir`));
    const filled = S.tasks.some(t => t.text.trim());
    await LN.schedule({ notifications: [{
      id: 1,
      channelId: 'foco',
      title: '3M · Tus 3 de hoy',
      body: filled ? S.tasks.filter(t => t.text.trim()).map(t => `${t.done ? '✓' : '○'} ${t.text.trim()}`).join('   ') : 'Define tus 3 tareas de hoy.',
      inboxList: lines,
      summaryText: '3M',
      smallIcon: 'ic_stat_3m',
      iconColor: BRAND,
      ongoing: true,
      autoCancel: false
    }] });
  } catch (_) {}
}

async function refreshNotification({ loud = false } = {}) {
  if (NATIVE) { if (S.settings.notify) await refreshNativeNotification(); return; }
  if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('3M · Tus 3 de hoy', {
      body: notifBody(),
      tag: '3m-daily',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      requireInteraction: true, // no se cierra sola
      renotify: loud,
      silent: !loud,
      data: { url: './' }
    });
  } catch (_) {}
}

async function registerPeriodicSync(reg) {
  try {
    if (!('periodicSync' in reg)) return;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('3m-daily', { minInterval: 6 * 60 * 60 * 1000 });
  } catch (_) {}
}

/* ---------------- Google Sheets ---------------- */
let syncing = false;
const setStatus = msg => { const el = $('#syncStatus'); if (el) el.textContent = msg; };

async function postDay(date, tasks) {
  const body = JSON.stringify({
    token: S.settings.token,
    fecha: date,
    tareas: tasks.map(t => ({ texto: t.text.trim(), estado: t.text.trim() ? (t.done ? 'Sí' : 'No') : '' }))
  });
  // text/plain evita el preflight CORS, que Apps Script no soporta.
  const r = await fetch(S.settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow'
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'La hoja rechazó el envío');
}

async function flush() {
  if (syncing || !S.settings.url || !navigator.onLine) return;
  const pending = S.history.filter(h => !h.synced).reverse(); // del más viejo al más nuevo
  if (!pending.length) return;
  syncing = true;
  try {
    for (const h of pending) {
      await postDay(h.date, h.tasks);
      h.synced = true;
      save();
    }
    setStatus('Historial al día en Google Sheets.');
  } catch (err) {
    setStatus(`No se pudo enviar: ${err.message}. Se reintentará solo.`);
  } finally {
    syncing = false;
    renderHistory();
  }
}

async function syncNow() {
  if (!S.settings.url) { setStatus('Pega primero la URL del Apps Script.'); return; }
  if (!navigator.onLine) { setStatus('Sin conexión. Se enviará cuando vuelva internet.'); return; }
  setStatus('Enviando…');
  try {
    await postDay(S.date, S.tasks); // también guarda el estado de hoy (la hoja lo reemplaza a medianoche)
    syncing = false;
    await flush();
    setStatus('Listo. Datos enviados a Google Sheets.');
  } catch (err) {
    setStatus(`No se pudo enviar: ${err.message}`);
  }
}

/* ---------------- Ajustes ---------------- */
function setupSettings() {
  const dlg = $('#settings');
  $('#btnSettings').addEventListener('click', () => {
    $('#optUrl').value = S.settings.url;
    $('#optToken').value = S.settings.token;
    $('#optNotify').checked = S.settings.notify && (NATIVE || Notification.permission === 'granted');
    setStatus('');
    dlg.showModal();
  });
  $('#optUrl').addEventListener('change', e => { S.settings.url = e.target.value.trim(); save(); });
  $('#optToken').addEventListener('change', e => { S.settings.token = e.target.value.trim(); save(); });
  $('#btnSync').addEventListener('click', syncNow);

  $('#optNotify').addEventListener('change', async e => {
    if (NATIVE) {
      if (!e.target.checked) {
        S.settings.notify = false; save();
        try { await LN.cancel({ notifications: [{ id: 1 }, { id: 2 }] }); } catch (_) {}
        return;
      }
      let perm = {};
      try { perm = await LN.requestPermissions(); } catch (_) {}
      if (perm.display !== 'granted') {
        e.target.checked = false;
        setStatus('Permiso de notificaciones denegado. Actívalo en Ajustes de Android → Apps → 3M.');
        return;
      }
      S.settings.notify = true; save();
      await setupNativeNotifications();
      scheduleMorning();
      refreshNativeNotification();
      return;
    }
    if (!e.target.checked) {
      S.settings.notify = false; save();
      const reg = await navigator.serviceWorker.getRegistration();
      (await reg?.getNotifications({ tag: '3m-daily' }) || []).forEach(n => n.close());
      return;
    }
    if (!('Notification' in window)) {
      e.target.checked = false;
      setStatus('Este navegador no admite notificaciones. En iPhone instala la app en la pantalla de inicio.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      e.target.checked = false;
      setStatus('Permiso de notificaciones denegado. Actívalo en los ajustes del navegador.');
      return;
    }
    S.settings.notify = true; save();
    const reg = await navigator.serviceWorker.ready;
    registerPeriodicSync(reg);
    refreshNotification({ loud: true });
  });

  // Botón de instalación
  let deferred;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    $('#btnInstall').hidden = false;
  });
  $('#btnInstall').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('#btnInstall').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; });
}

/* ---------------- Pestañas ---------------- */
function setupTabs() {
  document.querySelectorAll('.tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === b.dataset.view));
      $('#title').textContent = b.dataset.view === 'viewToday' ? 'Tus 3 de hoy' : 'Historial';
      $('#clock').hidden = b.dataset.view !== 'viewToday';
    });
  });
}

/* ---------------- Arranque ---------------- */
function init() {
  if (NOTE_VIEW) document.body.classList.add('note');
  rollover();
  renderAll();
  enableDrag();
  setupTabs();
  setupSettings();
  scheduleMidnight();
  updateClock();
  flush();
  publishSnapshot();

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); updateClock(); flush(); } });
  window.addEventListener('focus', tick);
  window.addEventListener('online', flush);
  setInterval(tick, 60 * 1000);
  document.fonts?.ready.then(() => document.querySelectorAll('.task').forEach(setStrike));

  if (NATIVE) {
    // El APK ya trae los archivos empaquetados: no hace falta service worker.
    setupNativeNotifications().then(() => {
      if (S.settings.notify) { scheduleMorning(); refreshNativeNotification(); }
    });
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (S.settings.notify) registerPeriodicSync(reg);
    }).catch(() => {});
  }
  if (!NATIVE && S.settings.notify) refreshNotification();
}

init();
