// Service worker simples: guarda os arquivos do app para abrir rápido.
const CACHE = "meu-treino-v49";
const ARQUIVOS = ["./", "index.html", "style.css", "app.js", "util.js", "treino.js", "print.js", "evolucao.js", "admin.js", "conquistas.js", "midia.js", "perfil.js", "fila.js", "lembrete.js", "texto.js", "boasvindas.js", "termos.html", "config.js", "manifest.json", "icon.svg", "logo.png", "icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== "meu-treino-ext").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (sempre a versão mais nova); se estiver sem internet, usa o cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // fotos dos exercícios e fontes: usa o que já tem guardado (não mudam)
  if (/(^|\.)(jsdelivr\.net|gstatic\.com|googleapis\.com)$/.test(url.hostname)) {
    e.respondWith(caches.open("meu-treino-ext").then(async (c) => {
      const tem = await c.match(e.request);
      if (tem) return tem;
      const r = await fetch(e.request);
      if (r.ok || r.type === "opaque") c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  // biblioteca do Supabase (esm.sh): rede primeiro, guardada para abrir sem internet
  if (url.hostname !== location.hostname && url.hostname !== "esm.sh") return;
  e.respondWith(
    fetch(e.request, url.hostname === location.hostname ? { cache: "no-store" } : undefined).then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

// lembrete de treino
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Meu Treino", {
    body: d.body || "", icon: "icon-512.png", badge: "icon-180.png", data: { url: d.url || "#/hoje" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL("./" + (e.notification.data?.url || ""), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    if (cs.length) { const c = cs[0]; return c.focus().then(() => c.navigate ? c.navigate(alvo).catch(() => {}) : null); }
    return self.clients.openWindow(alvo);
  }));
});
