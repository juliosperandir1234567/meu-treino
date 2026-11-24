// Service worker simples: guarda os arquivos do app para abrir rápido.
const CACHE = "meu-treino-v58";
const ARQUIVOS = ["./", "index.html", "style.css", "app.js", "util.js", "treino.js", "print.js", "evolucao.js", "admin.js", "conquistas.js", "midia.js", "perfil.js", "fila.js", "lembrete.js", "texto.js", "boasvindas.js", "termos.html", "config.js", "manifest.json", "icon.svg", "logo.png", "icon-180.png"];

self.addEventListener("install", (e) => {
  // baixa a versão nova de cada arquivo (sem pegar cópia velha do navegador)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== "meu-treino-ext").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Abre na hora com o que está guardado no celular e atualiza por trás.
// Versão nova do app chega pelo próprio service worker (o app recarrega sozinho quando ela assume).
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // fotos dos exercícios, fontes e biblioteca do Supabase (endereços com versão): guardado primeiro
  if (/(^|\.)(jsdelivr\.net|gstatic\.com|googleapis\.com)$/.test(url.hostname) || url.hostname === "esm.sh") {
    e.respondWith(caches.open("meu-treino-ext").then(async (c) => {
      const tem = await c.match(e.request);
      if (tem) return tem;
      const r = await fetch(e.request);
      if (r.ok || r.type === "opaque") c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  if (url.hostname !== location.hostname) return;
  // arquivos do app: responde com o guardado e busca a cópia nova em segundo plano
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const tem = await c.match(e.request, { ignoreSearch: url.pathname.endsWith(".png") });
    const nova = fetch(e.request, { cache: "no-store" }).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (tem) { e.waitUntil(nova); return tem; }
    return (await nova) || new Response("Sem internet", { status: 503 });
  }));
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
