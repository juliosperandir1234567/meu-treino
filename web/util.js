// Funções compartilhadas: Supabase, fotos, formatos, ícones, estado do treino.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const C = window.CONFIG || {};
export const sb = createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
export const configOk = !!(C.SUPABASE_URL && !C.SUPABASE_URL.includes("SEU-PROJETO") && C.SUPABASE_KEY && !C.SUPABASE_KEY.includes("COLE_AQUI"));

export const app = () => document.getElementById("app");
export const acoes = {};          // data-acao="nome" → acoes.nome(el, evento)
export const mudancas = {};       // data-muda="nome" → mudancas.nome(el, evento)
export const sessao = { user: null, perfil: null };
export const limpeza = { fn: null };  // parar timers ao trocar de tela

// Telas das abas ficam guardadas na memória: ao voltar para uma aba ela aparece na hora
// e se atualiza sozinha quando os dados novos chegam.
const ABAS = new Set(["#/hoje", "#/evolucao", "#/semana", "#/avaliacao", "#/clientes", "#/perfil"]);
const guardadas = new Map();
let mostrandoGuardada = null;
const chaveTela = () => (location.hash.replace(/^#\/?$/, "") || "#/hoje");
export function mostrarGuardada() {
  const k = chaveTela(), html = guardadas.get(k);
  if (html) { app().innerHTML = html; window.scrollTo(0, 0); mostrandoGuardada = k; return true; }
  app().classList.add("trocando");   // sem tela guardada: escurece a atual enquanto carrega
  return false;
}
export function esquecerTelas() { guardadas.clear(); mostrandoGuardada = null; }
export function render(html) {
  if (document.getElementById("folha")) fecharFolha();
  const k = chaveTela(), antes = guardadas.get(k);
  if (ABAS.has(k.split("?")[0])) guardadas.set(k, html);
  app().classList.remove("trocando");
  if (mostrandoGuardada === k) { mostrandoGuardada = null; if (antes !== html) renderSemRolar(html); return; }
  mostrandoGuardada = null;
  app().innerHTML = html; window.scrollTo(0, 0);
}
export function renderSemRolar(html) { app().classList.remove("trocando"); const y = window.scrollY; app().innerHTML = html; window.scrollTo(0, y); }
export function ir(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; }

export function h(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function toast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), ms);
}
export function erro(e, msg = "Algo deu errado") {
  console.error(e);
  toast(`${msg}${e?.message ? ": " + e.message : ""}`, 4500);
}
export function q(res) { if (res.error) throw res.error; return res.data; }

// ---------- números e datas ----------
export const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
export function fmt(v, casas = 1) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(casas).replace(".", ",");
}
export const kg = (v) => (v === null || v === undefined ? "—" : `${fmt(v)} kg`);
export function hora(d) { return d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"; }
export function dataCurta(d) { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
export function dataLonga(d = new Date()) {
  const s = new Date(d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function mmss(seg) {
  const s = Math.max(0, Math.round(Math.abs(seg)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function duracao(ini, fim) {
  const min = Math.round((new Date(fim) - new Date(ini)) / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}
export function inicioSemana(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dia = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - dia);
  return x;
}
export function normal(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// "10" → {min:10,max:10}; "8-12" → {min:8,max:12}; "falha" → null
export function metaReps(txt) {
  const n = String(txt || "").match(/\d+/g);
  if (!n) return null;
  const a = Number(n[0]), b = Number(n[1] ?? n[0]);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

// ---------- fotos ----------
const urlCache = new Map();
export async function fotoUrl(path) {
  if (!path) return null;
  if (urlCache.has(path)) return urlCache.get(path);
  const { data } = await sb.storage.from("fotos").createSignedUrl(path, 60 * 60 * 24);
  const u = data?.signedUrl || null;
  if (u) urlCache.set(path, u);
  return u;
}
export async function fotoUrls(paths) {
  const falta = [...new Set(paths.filter((p) => p && !urlCache.has(p)))];
  if (falta.length) {
    const { data } = await sb.storage.from("fotos").createSignedUrls(falta, 60 * 60 * 24);
    (data || []).forEach((d) => d.signedUrl && urlCache.set(d.path, d.signedUrl));
  }
  const m = {};
  paths.forEach((p) => { if (p) m[p] = urlCache.get(p) || null; });
  return m;
}
export function carregarImagem(src) {
  return new Promise((ok, falha) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = falha; i.src = src; });
}
// Reduz a foto (economiza espaço) e devolve um Blob JPEG
export async function reduzir(file, max = 1280, qualidade = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await carregarImagem(url);
    const esc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, "image/jpeg", qualidade));
  } finally { URL.revokeObjectURL(url); }
}
export function blobBase64(blob) {
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
}
export async function enviarFoto(blob, pasta) {
  const path = `${sessao.user.id}/${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  q(await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", upsert: false }));
  return path;
}
// Abre a câmera/galeria e devolve o arquivo escolhido (ou null)
export function escolherFoto({ camera = false, varias = false } = {}) {
  return new Promise((ok) => {
    const inp = document.getElementById("arquivo");
    inp.value = "";
    inp.multiple = varias;
    if (camera) inp.setAttribute("capture", "environment"); else inp.removeAttribute("capture");
    inp.onchange = () => ok(varias ? [...inp.files] : inp.files[0] || null);
    inp.click();
  });
}

// ---------- treino em andamento (guardado no aparelho) ----------
const CHAVE = "meu-treino-ativo";
export function treinoAtivo() { try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch { return null; } }
export function salvarTreinoAtivo(t) { try { if (t) localStorage.setItem(CHAVE, JSON.stringify(t)); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } }

// ---------- ícones (traço) ----------
const P = {
  voltar: '<polyline points="15 6 9 12 15 18"/>',
  seta: '<polyline points="9 6 15 12 9 18"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  casa: '<path d="M3 10.5 12 3l9 7.5V21H3z"/>',
  peso: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  sobe: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  check: '<polyline points="5 12 10 17 19 7"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  cima: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  baixo: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  fogo: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 3"/>',
  lixo: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l3 3M14 9l2 2"/>',
  lista: '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  sino: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  regua: '<rect x="2" y="8" width="20" height="8" rx="2"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};
export function ico(nome, tam = 20, extra = "") {
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[nome] || ""}</svg>`;
}
export function botaoVoltar(hash) {
  return `<a class="ico" href="${hash}" aria-label="Voltar">${ico("voltar")}</a>`;
}
export function nav(atual) {
  const it = [["#/perfil", "pessoa", "Perfil"], ["#/hoje", "casa", "Hoje"], ["#/evolucao", "sobe", "Evolução"], ["#/semana", "fogo", "Semana"], ["#/avaliacao", "regua", "Avaliação"]];
  if (atual === "#/clientes") atual = "#/perfil";
  return `<nav class="nav"><div style="grid-template-columns:repeat(${it.length},minmax(0,1fr))">${it.map(([href, i, t]) => `<a href="${href}" class="${atual === href ? "at" : ""}">${ico(i, 22)}${t}</a>`).join("")}</div></nav>`;
}

// ---------- grupos musculares (para o resumo da semana) ----------
const GRUPOS = [
  ["Ombro", ["desenvolvimento", "elevacao lateral", "elevacao frontal", "ombro", "crucifixo inverso", "face pull", "remada alta", "arnold"]],
  ["Braço", ["rosca", "triceps", "biceps", "testa", "frances", "coice", "martelo", "scott", "mergulho"]],
  ["Costas", ["puxada", "remada", "pulldown", "pull down", "barra fixa", "pullover", "serrote", "lombar", "graviton"]],
  ["Peito", ["supino", "crucifixo", "voador", "peck", "crossover", "cross over", "flexao", "peitoral", "chest"]],
  ["Pernas", ["agachamento", "leg", "extensora", "flexora", "adutora", "abdutora", "stiff", "panturrilha", "gluteo", "glute", "hack", "afundo", "bulgaro", "terra", "elevacao pelvica", "sumo", "passada"]],
  ["Abdômen", ["abdominal", "prancha", "abdomen", "infra", "obliquo", "crunch"]],
];
export function grupoDe(nome) {
  const n = normal(nome);
  for (const [g, chaves] of GRUPOS) if (chaves.some((c) => n.includes(c))) return g;
  return "Outros";
}
// Nome do treino pelos exercícios (sem IA): grupos que mais aparecem. Ex.: "Perna e Ombro", "Peito, Ombro e Tríceps"
const BICEPS = ["rosca", "biceps", "martelo", "scott"], TRICEPS = ["triceps", "testa", "frances", "coice", "mergulho", "pulley corda"];
const NOME_GRUPO = { Pernas: "Perna", Ombro: "Ombro", Costas: "Costas", Peito: "Peito", "Abdômen": "Abdômen" };
export function nomeDoTreino(nomes) {
  const cont = {};
  (nomes || []).forEach((nome) => {
    let g = grupoDe(nome);
    if (g === "Braço") { const n = normal(nome); g = TRICEPS.some((c) => n.includes(c)) ? "Tríceps" : BICEPS.some((c) => n.includes(c)) ? "Bíceps" : "Braço"; }
    else g = NOME_GRUPO[g] || null;
    if (g) cont[g] = (cont[g] || 0) + 1;
  });
  const total = Object.values(cont).reduce((a, b) => a + b, 0);
  if (!total) return "";
  let gs = Object.keys(cont).sort((a, b) => cont[b] - cont[a]);
  // entra quem tem peso na ficha; abdômen só se for parte grande do treino
  gs = gs.filter((g, i) => i === 0 || (cont[g] >= 2 || cont[g] / total >= 0.25) && (g !== "Abdômen" || cont[g] / total >= 0.3)).slice(0, 3);
  if (gs.includes("Bíceps") && gs.includes("Tríceps")) gs = gs.filter((g) => g !== "Tríceps").map((g) => (g === "Bíceps" ? "Braço" : g));
  return gs.length === 1 ? gs[0] : gs.slice(0, -1).join(", ") + " e " + gs[gs.length - 1];
}
export const METAS = { "Ombro": 16, "Braço": 16, "Costas": 12, "Peito": 10, "Pernas": 10, "Abdômen": 8 };

// ---------- gráfico de linha simples ----------
// Gráfico de linha: escala com folga (pequenas mudanças não parecem um tombo), valor e data em cada ponto
// e, se vierem as datas reais (opc.datas), a distância entre os pontos segue o tempo.
export function grafico(valores, rotulos = [], opc = {}) {
  const idx = valores.map((_, i) => i).filter((i) => valores[i] !== null && valores[i] !== undefined && !isNaN(Number(valores[i])));
  if (idx.length < 2) return `<div class="mudo peq">Precisa de pelo menos 2 registros para o gráfico.</div>`;
  const W = 320, H = 160, pl = 16, pr = 16, pt = 24, pb = 30;
  const v = idx.map((i) => Number(valores[i]));
  let min = Math.min(...v), max = Math.max(...v);
  const folga = Math.max((max - min) * 0.35, Math.abs(max) * 0.05, 0.5);
  min -= folga; max += folga;
  const ts = opc.datas ? opc.datas.map((s) => new Date(s).getTime()) : null;
  const pos = (i) => (ts ? ts[i] : i);
  const x0 = pos(idx[0]), x1 = pos(idx[idx.length - 1]);
  const X = (i) => pl + ((pos(i) - x0) / ((x1 - x0) || 1)) * (W - pl - pr);
  const Y = (val) => pt + (1 - (val - min) / (max - min)) * (H - pt - pb);
  const pts = idx.map((i) => ({ x: X(i), y: Y(Number(valores[i])), v: Number(valores[i]), r: rotulos[i] }));
  const nb = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
  const ancora = (x) => (x < 40 ? "start" : x > W - 40 ? "end" : "middle");
  const todos = pts.length <= 7;
  const marcados = todos ? pts : [pts[0], pts[pts.length - 1]];
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ${nb(v[0])} a ${nb(v[v.length - 1])}">
    <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" stroke="#E1E7F0"/>
    <polyline points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#2563EB" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, k) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${k === pts.length - 1 ? 5 : 3.5}" fill="${k === pts.length - 1 ? "#2563EB" : "#FFFFFF"}" stroke="#2563EB" stroke-width="2"/>`).join("")}
    ${marcados.map((p) => `<text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="${ancora(p.x)}" font-size="12" font-weight="700" fill="#0F172A">${nb(p.v)}</text>`).join("")}
    ${marcados.filter((p) => p.r).map((p) => `<text x="${p.x.toFixed(1)}" y="${H - 10}" text-anchor="${ancora(p.x)}" font-size="11" fill="#64748B">${h(p.r)}</text>`).join("")}
  </svg>`;
}

// ---------- som e tela ligada ----------
let audio;
export function bip(vezes = 2) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < vezes; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      const t = audio.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t); o.stop(t + 0.3);
    }
  } catch { /* sem áudio */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
export function destravarAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* */ } }
let trava = null;
export async function manterTelaLigada(on) {
  try {
    if (on && "wakeLock" in navigator && !trava) { trava = await navigator.wakeLock.request("screen"); trava.addEventListener("release", () => { trava = null; }); }
    if (!on && trava) { await trava.release(); trava = null; }
  } catch { /* não suportado */ }
}

// ---------- comemoração (recordes e conquistas) ----------
export function comemorar(titulo, sub = "") {
  document.getElementById("festa")?.remove();
  const cores = ["#2563EB", "#F59E0B", "#10B981", "#60A5FA", "#F472B6"];
  const pedacos = Array.from({ length: 46 }, (_, i) => {
    const x = Math.random() * 100, d = 1.6 + Math.random() * 1.4, at = Math.random() * 0.5, r = Math.random() * 360;
    return `<i style="left:${x}%;background:${cores[i % cores.length]};animation-duration:${d}s;animation-delay:${at}s;transform:rotate(${r}deg)"></i>`;
  }).join("");
  const el = document.createElement("div");
  el.id = "festa"; el.setAttribute("role", "status");
  el.innerHTML = `${pedacos}<div class="festa-card"><span class="festa-ico">🏆</span><b>${h(titulo)}</b>${sub ? `<span>${h(sub)}</span>` : ""}</div>`;
  el.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
  try { navigator.vibrate?.([80, 60, 120]); } catch { /* */ }
  bip(3);
  setTimeout(() => el.remove(), 3600);
}

/// ---------- desenho do corpo com os músculos da semana ----------
// Contorno e músculos desenhados com curvas suaves; cada lado é espelhado.
// pct: { "Ombro": 0..1, "Peito", "Braço", "Costas", "Pernas", "Abdômen" }
function suave(p) {
  // curva fechada passando pelos pontos (Catmull-Rom convertido em Bézier)
  const n = p.length, f = (v) => Math.round(v * 10) / 10;
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
  }
  return d + "Z";
}
// metade esquerda da figura (x de 0 a 80; o centro do corpo é x = 80)
const CONTORNO = [[80, 50], [72, 52], [70, 60], [56, 64], [42, 69], [33, 78], [30, 96], [28, 120], [25, 142], [21, 166], [18, 186], [15, 200], [17, 213], [25, 216], [30, 203], [31, 188], [36, 166], [41, 144], [45, 122], [48, 108], [50, 126], [53, 150], [50, 168], [46, 196], [45, 232], [48, 258], [45, 282], [47, 308], [51, 330], [46, 342], [66, 346], [69, 334], [67, 318], [69, 292], [72, 262], [76, 222], [78, 196], [80, 192]];
const FRENTE = [
  ["Ombro", [[41, 70], [53, 66], [58, 74], [52, 92], [44, 104], [34, 99], [32, 84]]],
  ["Peito", [[58, 73], [78, 75], [79, 101], [70, 107], [57, 105], [49, 97], [53, 83]]],
  ["Braço", [[44, 106], [48, 112], [46, 132], [41, 142], [34, 139], [32, 120], [36, 105]]],
  ["Braço", [[34, 145], [40, 147], [37, 168], [30, 186], [24, 185], [25, 166]], 0.55],
  ["Abdômen", [[55, 109], [66, 111], [67, 150], [60, 162], [53, 142]]],
  ["Abdômen", [[69, 109], [79, 109], [79, 123], [69, 123]]],
  ["Abdômen", [[69, 126], [79, 126], [79, 140], [69, 140]]],
  ["Abdômen", [[69, 143], [79, 143], [79, 158], [69, 158]]],
  ["Abdômen", [[70, 161], [79, 161], [79, 182], [72, 176]]],
  ["Pernas", [[53, 176], [66, 182], [75, 202], [73, 240], [64, 256], [54, 252], [48, 226], [48, 196]]],
  ["Pernas", [[73, 200], [79, 198], [78, 228], [74, 234]], 0.7],
  ["Pernas", [[51, 266], [60, 264], [64, 290], [60, 320], [55, 320], [49, 292]]],
];
const COSTAS = [
  ["Costas", [[70, 55], [80, 53], [80, 106], [72, 94], [60, 74], [49, 67]]],
  ["Ombro", [[41, 70], [51, 67], [56, 76], [50, 94], [43, 103], [34, 98], [32, 84]]],
  ["Costas", [[53, 96], [68, 97], [79, 110], [79, 150], [66, 160], [56, 142], [50, 113]]],
  ["Costas", [[68, 153], [79, 153], [79, 172], [69, 170]], 0.7],
  ["Braço", [[36, 101], [46, 105], [47, 132], [41, 143], [33, 137], [31, 115]]],
  ["Braço", [[34, 146], [40, 148], [37, 168], [30, 186], [24, 185], [25, 166]], 0.55],
  ["Pernas", [[54, 168], [78, 172], [79, 199], [70, 207], [56, 205], [50, 187]]],
  ["Pernas", [[52, 210], [76, 210], [74, 246], [64, 258], [54, 254], [48, 230]]],
  ["Pernas", [[49, 264], [64, 263], [67, 290], [60, 308], [54, 308], [47, 287]]],
];
export function corpoSvg(pct = {}, lado = null) {
  const cor = (g, peso = 1) => {
    const p = Math.max(0, Math.min(1, (pct[g] || 0) * peso));
    return p ? `fill="#2563EB" fill-opacity="${(0.25 + 0.75 * p).toFixed(2)}"` : `fill="#C9D3E1"`;
  };
  const contorno = suave(CONTORNO);
  const figura = (x0, musc, rotulo) => {
    const metade = musc.map(([g, pts, peso]) => `<path d="${suave(pts)}" ${cor(g, peso)}><title>${g}</title></path>`).join("");
    return `<g transform="translate(${x0},0)">
      <path d="${contorno}" fill="#E3E9F2"/><path d="${contorno}" fill="#E3E9F2" transform="translate(160,0) scale(-1,1)"/>
      <ellipse cx="80" cy="29" rx="16" ry="20" fill="#E3E9F2"/>
      <g stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round">${metade}<g transform="translate(160,0) scale(-1,1)">${metade}</g></g>
      ${rotulo ? `<text x="80" y="368" text-anchor="middle" font-size="13" font-family="Inter, Arial, sans-serif" fill="#64748B">${rotulo}</text>` : ""}</g>`;
  };
  if (lado) return `<svg viewBox="0 0 160 352" aria-hidden="true">${figura(0, lado === "costas" ? COSTAS : FRENTE, "")}</svg>`;
  return `<svg class="corpo" viewBox="0 0 340 374" role="img" aria-label="Músculos treinados na semana">${figura(4, FRENTE, "Frente")}${figura(176, COSTAS, "Costas")}</svg>`;
}

// ---------- barras: esta semana × semana passada (por dia) ----------
export function barrasSemana(atual, passada, rotulos) {
  const W = 320, H = 130, base = H - 18, topo = 8;
  const max = Math.max(1, ...atual, ...passada);
  const larg = W / rotulos.length;
  const barra = (v, x, w, cls) => { const hh = v ? Math.max(3, ((base - topo) * v) / max) : 0; return hh ? `<rect class="${cls}" x="${x}" y="${base - hh}" width="${w}" height="${hh}" rx="3"/>` : ""; };
  const cols = rotulos.map((t, i) => {
    const x0 = i * larg + larg * 0.18, w = larg * 0.3;
    return barra(passada[i], x0, w, "b-ant") + barra(atual[i], x0 + w + 2, w, "b-at")
      + `<text x="${i * larg + larg / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#64748B">${t}</text>`;
  }).join("");
  return `<svg class="barras" viewBox="0 0 ${W} ${H}" role="img" aria-label="Volume por dia, esta semana e a anterior">
    <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#E1E7F0"/>${cols}</svg>`;
}

// ---------- folha que sobe de baixo (lista, foto, explicação) ----------
export function abrirFolha(html, rotulo = "") {
  fecharFolha();
  const el = document.createElement("div");
  el.id = "folha"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); if (rotulo) el.setAttribute("aria-label", rotulo);
  el.innerHTML = `<div class="folha-fundo" data-acao="fecharFolha"></div><div class="folha-caixa"><div class="folha-alca"></div><div class="folha-corpo">${html}</div></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  return el.querySelector(".folha-corpo");
}
export function fecharFolha() {
  document.getElementById("folha")?.remove();
  document.body.style.overflow = "";
}
acoes.fecharFolha = () => fecharFolha();
