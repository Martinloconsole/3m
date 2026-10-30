'use strict';

const VERSION = '3m-v1';
const DATA_CACHE = '3m-data'; // lo escribe la app; nunca se borra al actualizar
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'widget/template.json'
];
const DATA_URL = () => new URL('widget/data.json', self.registration.scope).href;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------- Ciclo de vida ---------- */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== DATA_CACHE && !k.startsWith('3m-fonts')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- Red ---------- */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // los POST a Apps Script pasan directos
  const url = new URL(req.url);

  // Datos del widget: salen del caché que llena la app
  if (url.origin === location.origin && url.pathname.endsWith('/widget/data.json')) {
    e.respondWith(
      caches.match(req, { cacheName: DATA_CACHE, ignoreSearch: true })
        .then(r => r || new Response(JSON.stringify({ date: '', t1: '·', t2: '·', t3: '·' }), { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // Tipografías de Google: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open('3m-fonts').then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Navegación: red primero, caché como respaldo offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put('index.html', copy));
        return r;
      }).catch(() => caches.match('index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Resto de archivos propios: caché primero, actualiza en segundo plano
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(r => {
        if (r.ok) caches.open(VERSION).then(c => c.put(req, r.clone()));
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

/* ---------- Notificaciones ---------- */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('./');
    })
  );
});

async function readData() {
  const c = await caches.open(DATA_CACHE);
  const r = await c.match(DATA_URL());
  return r ? r.json() : null;
}

// Recordatorio en segundo plano (solo Chrome/Edge con la app instalada; el navegador decide cuándo corre)
self.addEventListener('periodicsync', e => {
  if (e.tag !== '3m-daily') return;
  e.waitUntil((async () => {
    const d = await readData();
    const isToday = d && d.date === todayStr();
    const lines = isToday ? [d.t1, d.t2, d.t3].filter(l => l && l !== '·') : [];
    await self.registration.showNotification('3M · Tus 3 de hoy', {
      body: lines.length ? lines.join('\n') : 'Define tus 3 tareas de hoy.',
      tag: '3m-daily',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      requireInteraction: true,
      silent: true
    });
  })());
});

/* ---------- Widget (Edge / Windows 11) ---------- */
async function updateWidgets() {
  if (!self.widgets) return;
  const [tpl, data] = await Promise.all([
    fetch('widget/template.json').then(r => r.text()),
    readData()
  ]);
  await self.widgets.updateByTag('3m-tasks', { template: tpl, data: JSON.stringify(data || { t1: '·', t2: '·', t3: '·' }) });
}

self.addEventListener('widgetinstall', e => e.waitUntil(updateWidgets()));
self.addEventListener('widgetresume', e => e.waitUntil(updateWidgets()));
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'WIDGETS') e.waitUntil(updateWidgets());
});
