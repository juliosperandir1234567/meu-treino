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
export const sessao = { user: null };
export const limpeza = { fn: null };  // parar timers ao trocar de tela

export function render(html) { app().innerHTML = html; window.scrollTo(0, 0); }
export function renderSemRolar(html) { const y = window.scrollY; app().innerHTML = html; window.scrollTo(0, y); }
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
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};
export function ico(nome, tam = 20, extra = "") {
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[nome] || ""}</svg>`;
}
export function botaoVoltar(hash) {
  return `<a class="ico" href="${hash}" aria-label="Voltar">${ico("voltar")}</a>`;
}
export function nav(atual) {
  const it = [["#/hoje", "casa", "Hoje"], ["#/evolucao", "sobe", "Evolução"], ["#/semana", "fogo", "Semana"], ["#/avaliacao", "pessoa", "Avaliação"]];
  return `<nav class="nav"><div>${it.map(([href, i, t]) => `<a href="${href}" class="${atual === href ? "at" : ""}">${ico(i, 22)}${t}</a>`).join("")}</div></nav>`;
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
export const METAS = { "Ombro": 16, "Braço": 16, "Costas": 12, "Peito": 10, "Pernas": 10, "Abdômen": 8 };

// ---------- gráfico de linha simples ----------
export function grafico(valores, rotulos = []) {
  const v = valores.filter((x) => x !== null && x !== undefined);
  if (v.length < 2) return `<div class="mudo peq">Precisa de pelo menos 2 registros para o gráfico.</div>`;
  const W = 320, H = 120, p = 10;
  const min = Math.min(...v), max = Math.max(...v), d = max - min || 1;
  const pts = valores.map((x, i) => x === null ? null : [p + (i * (W - 2 * p)) / (valores.length - 1), H - p - ((x - min) / d) * (H - 2 * p)]).filter(Boolean);
  const ult = pts[pts.length - 1];
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfico de ${fmt(v[0])} a ${fmt(v[v.length - 1])}">
    <line x1="0" y1="${p}" x2="${W}" y2="${p}" stroke="#2A2E34"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#2A2E34"/><line x1="0" y1="${H - p}" x2="${W}" y2="${H - p}" stroke="#2A2E34"/>
    <polyline points="${pts.map((x) => x.join(",")).join(" ")}" fill="none" stroke="#C6F432" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${ult[0]}" cy="${ult[1]}" r="4" fill="#C6F432"/></svg>
    ${rotulos.length ? `<div class="entre mini mudo"><span>${h(rotulos[0])}</span><span>${h(rotulos[rotulos.length - 1])}</span></div>` : ""}`;
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
