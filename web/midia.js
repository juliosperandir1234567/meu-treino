// Imagens dos exercícios: fotos de domínio público do free-exercise-db (posição inicial e final),
// alternadas para mostrar o movimento. A ligação "nome em português → foto" vem da função
// midia-exercicios (escolhida por IA uma vez e guardada para todos) e fica em cache no aparelho.
import { sb, h, normal, grupoDe, corpoSvg, ico } from "./util.js";

const BASE = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/";
const CHAVE = "midia-v2";   // v2: a v1 guardou "sem imagem" para muitos nomes que agora têm foto
let cache = {};
try { localStorage.removeItem("midia-v1"); cache = JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { cache = {}; }
// só guarda no aparelho quem tem foto; "sem foto" vale só nesta abertura do app (pode ganhar foto depois)
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(Object.entries(cache).filter(([, v]) => v?.ref)))); } catch { /* sem espaço */ } };
const pendentes = new Map();   // chave → promessa, para não pedir o mesmo nome duas vezes

// músculos do catálogo (inglês) → grupos do app
const GRUPO_EN = {
  chest: "Peito", shoulders: "Ombro", neck: "Ombro", traps: "Costas", lats: "Costas", "middle back": "Costas", "lower back": "Costas",
  biceps: "Braço", triceps: "Braço", forearms: "Braço", abdominals: "Abdômen",
  quadriceps: "Pernas", hamstrings: "Pernas", glutes: "Pernas", calves: "Pernas", adductors: "Pernas", abductors: "Pernas",
};
const NOME_EN = {
  chest: "Peitoral", shoulders: "Ombros", neck: "Pescoço", traps: "Trapézio", lats: "Dorsais", "middle back": "Costas", "lower back": "Lombar",
  biceps: "Bíceps", triceps: "Tríceps", forearms: "Antebraço", abdominals: "Abdômen",
  quadriceps: "Quadríceps", hamstrings: "Posteriores", glutes: "Glúteos", calves: "Panturrilhas", adductors: "Adutores", abductors: "Abdutores",
};
// músculos que aparecem melhor de costas
const DE_COSTAS = new Set(["traps", "lats", "middle back", "lower back", "triceps", "hamstrings", "glutes", "calves"]);

export const midiaDe = (nome) => cache[normal(nome)];
export function gruposDe(nome) {
  const m = midiaDe(nome);
  const gs = [...new Set((m?.primarios || []).map((x) => GRUPO_EN[x]).filter(Boolean))];
  return gs.length ? gs : [grupoDe(nome)].filter((g) => g !== "Outros");
}
// músculos com nome detalhado (Peitoral, Dorsais...) para os cards de "músculos alvo"
export function musculosDe(nome) {
  const m = midiaDe(nome);
  if (m?.primarios?.length) return m.primarios.map((x) => ({ en: x, nome: NOME_EN[x] || x, grupo: GRUPO_EN[x], costas: DE_COSTAS.has(x) })).filter((x) => x.grupo);
  const g = grupoDe(nome);
  return g === "Outros" ? [] : [{ en: g, nome: g, grupo: g, costas: g === "Costas" }];
}

// Garante que os nomes tenham mídia (busca só os que faltam). Devolve true se algo novo chegou.
export async function carregarMidia(nomes) {
  const faltam = [...new Set(nomes.filter((n) => n && !(normal(n) in cache) && !pendentes.has(normal(n))))];
  const novos = [];
  for (let i = 0; i < faltam.length; i += 40) {
    const lote = faltam.slice(i, i + 40);
    const p = sb.functions.invoke("midia-exercicios", { body: { nomes: lote } }).then(({ data }) => {
      const r = data?.resultado || {};
      for (const n of lote) if (r[n]) { cache[normal(n)] = r[n]; novos.push(n); }
      salvar();
    }).catch(() => { /* sem imagem agora; tenta na próxima vez */ }).finally(() => lote.forEach((n) => pendentes.delete(normal(n))));
    lote.forEach((n) => pendentes.set(normal(n), p));
    await p;
  }
  // espera também os que já estavam sendo buscados por outra tela
  await Promise.all(nomes.map((n) => pendentes.get(normal(n))).filter(Boolean));
  return novos.length > 0;
}

function interno(nome) {
  const m = midiaDe(nome);
  if (m?.ref) {
    const a = BASE + m.ref + "/0.jpg", b = BASE + m.ref + "/1.jpg";
    return `<img src="${a}" alt="" decoding="async"><img class="q2" src="${b}" alt="" decoding="async">`;
  }
  return `<span class="ex-img-vazio">${ico("peso", 26)}</span>`;
}
// Imagem animada do exercício. Se a mídia ainda não chegou, preencherMidia() troca depois.
export function exImg(nome, cls = "") {
  return `<div class="ex-img ${cls}" data-midia="${h(normal(nome))}" data-nome="${h(nome)}">${interno(nome)}</div>`;
}
// Selo pequeno com o corpo e o músculo principal destacado
export function seloMusculo(nome) {
  const ms = musculosDe(nome);
  if (!ms.length) return "";
  const pct = Object.fromEntries(ms.map((m) => [m.grupo, 1]));
  return `<span class="selo-musc" aria-hidden="true">${corpoSvg(pct, ms[0].costas ? "costas" : "frente")}</span>`;
}
// Depois que a mídia chega: atualiza as imagens que estão na tela sem redesenhar tudo
export function preencherMidia(raiz = document) {
  raiz.querySelectorAll(".ex-img[data-midia]").forEach((el) => {
    const nome = el.dataset.nome;
    if (midiaDe(nome)?.ref && !el.querySelector("img")) el.innerHTML = interno(nome);
  });
}
