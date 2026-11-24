// Treino em andamento, opções de equipamento, treino concluído e publicação.
import {
  sb, acoes, mudancas, limpeza, render, renderSemRolar, ir, h, toast, q, num, fmt, kg, hora, mmss, duracao,
  metaReps, ico, botaoVoltar, treinoAtivo, salvarTreinoAtivo, fotoUrl, fotoUrls, reduzir, enviarFoto, escolherFoto,
  carregarImagem, grupoDe, corpoSvg, bip, destravarAudio, manterTelaLigada, comemorar, abrirFolha, fecharFolha, grafico,
} from "./util.js";
import { exImg, carregarMidia, preencherMidia, musculosDe } from "./midia.js";
import { idNovo, enfileirar, enviar, pendentes, aoMudarFila } from "./fila.js";

let D = null; // dados do treino carregados

// ---------- iniciar ----------
export async function iniciarTreino(fichaId) {
  const ativo = treinoAtivo();
  if (ativo && !confirm("Já existe um treino em andamento. Começar outro mesmo assim?")) return ir("#/treino");
  // o treino anterior foi aberto e nenhuma série foi marcada: apaga, para não contar como treino
  if (ativo && Array.isArray(ativo.feitas) && !ativo.feitas.length) enfileirar({ tipo: "del", tab: "sessoes", id: ativo.sessaoId });
  let f;
  try { f = q(await sb.from("fichas").select("*").eq("id", fichaId).single()); }
  catch (e) { f = guardado(fichaId)?.f; if (!f) throw new Error("Sem internet, e este treino ainda não foi aberto neste celular"); }
  const nome = `Treino ${f.letra}${f.nome ? " · " + f.nome : ""}`;
  const sid = idNovo(), inicio = new Date().toISOString();
  enfileirar({ tipo: "ins", tab: "sessoes", id: sid, dados: { ficha_id: f.id, ficha_nome: nome, inicio } });
  destravarAudio();
  salvarTreinoAtivo({ sessaoId: sid, fichaId: f.id, fichaNome: nome, inicio, feitas: [], idx: 0, opcoes: {}, ultimaSerie: null, descansoAte: null, descansoTotal: 0 });
  D = null;
  ir("#/treino");
}

// ---------- dados guardados no celular (para treinar sem internet) ----------
const chDados = (id) => "treino-dados-" + id;
function guardado(fichaId) { try { return JSON.parse(localStorage.getItem(chDados(fichaId))); } catch { return null; } }
function guardar(fichaId, v) { try { localStorage.setItem(chDados(fichaId), JSON.stringify({ ...v, em: Date.now() })); } catch { /* sem espaço */ } }
// Guarda todas as fichas de uma vez (no máximo a cada 6 h), para poder começar qualquer treino sem sinal.
export async function guardarParaSemInternet() {
  try {
    if (!navigator.onLine || Date.now() - Number(localStorage.getItem("treino-dados-em") || 0) < 6 * 36e5) return;
    const [rf, re, rq, rh] = await Promise.all([
      sb.from("fichas").select("*"),
      sb.from("exercicios").select("*").eq("ativo", true).order("ordem"),
      sb.from("equipamentos").select("*"),
      sb.from("series_feitas").select("*").order("feita_em", { ascending: false }).limit(800),
    ]);
    const fichas = q(rf), exs = q(re), eqs = q(rq), hist = q(rh);
    for (const f of fichas) {
      const meus = exs.filter((e) => e.ficha_id === f.id), ids = new Set(meus.map((e) => e.id));
      guardar(f.id, { f, exs: meus, eqs: eqs.filter((e) => ids.has(e.exercicio_id)), hist: hist.filter((x) => ids.has(x.exercicio_id)).slice(0, 250) });
    }
    localStorage.setItem("treino-dados-em", String(Date.now()));
  } catch { /* tenta outro dia */ }
}

async function carregar(t) {
  let exs, eqs, hist, urls = {};
  try {
    const [rf, re] = await Promise.all([
      sb.from("fichas").select("*").eq("id", t.fichaId).single(),
      sb.from("exercicios").select("*").eq("ficha_id", t.fichaId).eq("ativo", true).order("ordem"),
    ]);
    const f = q(rf); exs = q(re);
    const ids = exs.map((e) => e.id);
    const [rq, rh] = await Promise.all([
      ids.length ? sb.from("equipamentos").select("*").in("exercicio_id", ids) : { data: [] },
      ids.length ? sb.from("series_feitas").select("*").in("exercicio_id", ids).neq("sessao_id", t.sessaoId).order("feita_em", { ascending: false }).limit(600) : { data: [] },
    ]);
    eqs = q(rq); hist = q(rh);
    guardar(t.fichaId, { f, exs, eqs, hist: hist.slice(0, 250) });
    try { urls = await fotoUrls(eqs.map((e) => e.foto_path)); } catch { /* fotos ficam para depois */ }
  } catch (e) {
    // sem internet: usa o que ficou guardado da última vez
    const g = guardado(t.fichaId);
    if (!g) throw e;
    exs = g.exs; eqs = g.eqs; hist = (g.hist || []).filter((x) => x.sessao_id !== t.sessaoId);
  }
  if (!t.feitas) {   // treino começado numa versão antiga do app
    try { t.feitas = q(await sb.from("series_feitas").select("*").eq("sessao_id", t.sessaoId).order("feita_em")); } catch { t.feitas = []; }
    salvarTreinoAtivo(t);
  }
  if (!t.inicio) {
    try { t.inicio = q(await sb.from("sessoes").select("inicio").eq("id", t.sessaoId).single()).inicio; } catch { t.inicio = new Date().toISOString(); }
    salvarTreinoAtivo(t);
  }
  D = { sessaoId: t.sessaoId, s: { inicio: t.inicio }, exs, eqs, feitas: t.feitas, hist, urls, avisos: [], avisouAcima: {} };
  // imagens do movimento: chegam em segundo plano e entram na tela sem atrapalhar
  carregarMidia(exs.map((e) => e.nome)).then(() => preencherMidia()).catch(() => {});
}

// séries da última vez (mesmo exercício e mesma opção de equipamento)
function ultimaVez(exId, opcao) {
  const h1 = D.hist.filter((x) => x.exercicio_id === exId && x.equipamento_opcao === opcao);
  if (!h1.length) return { porNum: {}, carga: null, max: null };
  const sid = h1[0].sessao_id;
  const daquela = h1.filter((x) => x.sessao_id === sid);
  const porNum = {}; daquela.forEach((x) => { porNum[x.numero] = x; });
  const max = Math.max(...h1.map((x) => Number(x.carga) || 0));
  return { porNum, carga: h1[0].carga, max: max || null };
}

// ---------- TREINO EM ANDAMENTO ----------
export async function telaTreino() {
  const t = treinoAtivo();
  if (!t) return ir("#/hoje");
  if (!D || D.sessaoId !== t.sessaoId) await carregar(t);
  if (!D.exs.length) { toast("Essa ficha não tem exercícios"); return ir(`#/ficha/${t.fichaId}`); }
  manterTelaLigada(true);
  desenharTreino(true);
  const prox = D.exs.findIndex((e) => D.feitas.filter((x) => x.exercicio_id === e.id).length < e.series);
  if (D.feitas.length && prox > 0) setTimeout(() => document.getElementById(`ex-${prox}`)?.scrollIntoView({ block: "start" }), 30);
  let pedirFim = false; try { pedirFim = !!sessionStorage.getItem("finalizar-ao-abrir"); sessionStorage.removeItem("finalizar-ao-abrir"); } catch { /* */ }
  if (pedirFim) setTimeout(() => acoes.finalizar(), 50);
  let avisou10 = false, avisou0 = false, ultimoAte = null;
  const timer = setInterval(() => {
    const tt = treinoAtivo(); if (!tt) return;
    const el = document.getElementById("decorrido");
    if (el) el.textContent = mmss((Date.now() - new Date(D.s.inicio)) / 1000);
    if (tt.descansoAte !== ultimoAte) { ultimoAte = tt.descansoAte; avisou10 = false; avisou0 = false; }
    if (!tt.descansoAte) return;
    const resta = (new Date(tt.descansoAte) - Date.now()) / 1000;
    const c = document.getElementById("cron"), card = document.getElementById("cardDescanso"), rot = document.getElementById("rotDescanso");
    // acabou há mais de 2 min: some sozinho (o tempo real de descanso continua sendo medido pela próxima série)
    if (resta < -120) { tt.descansoAte = null; salvarTreinoAtivo(tt); document.getElementById("cardDescanso")?.remove(); return; }
    const fim = resta <= 0;
    if (c) c.textContent = fim ? "Bora!" : mmss(resta);
    if (card) card.classList.toggle("pronto", fim);
    if (card) card.classList.toggle("ac-borda", fim);
    if (rot) rot.textContent = fim ? "Descanso acabou · hora da próxima série" : "Descanso";
    const bar = document.getElementById("barDescanso");
    if (bar) { const tot = tt.descansoTotal || 90; bar.style.width = `${fim ? 0 : Math.max(0, Math.min(100, (resta / tot) * 100))}%`; }
    if (resta <= 10 && resta > 0 && !avisou10) { avisou10 = true; bip(1); }
    if (resta <= 0 && !avisou0) { avisou0 = true; bip(3); }
  }, 1000);
  const tirarOuvinte = aoMudarFila(mostrarFila);
  limpeza.fn = () => { clearInterval(timer); manterTelaLigada(false); tirarOuvinte(); };
}
function mostrarFila(n = pendentes()) {
  const el = document.getElementById("filaInfo"); if (!el) return;
  el.hidden = !n;
  el.textContent = `Sem internet · ${n} ${n === 1 ? "registro guardado" : "registros guardados"} no celular`;
}

// Tela do treino: todos os exercícios numa lista só (rola para baixo), séries em tabela,
// descanso numa faixa embaixo e Finalizar sempre no alto.
const rasc = {};   // o que a pessoa digitou e ainda não marcou (não se perde ao redesenhar)
mudancas.rascunho = (el) => { rasc[el.dataset.k] = el.value; };
function recordesHoje() {
  let n = 0;
  for (const e of D.exs) {
    const antes = Math.max(0, ...D.hist.filter((x) => x.exercicio_id === e.id).map((x) => Number(x.carga) || 0));
    const hoje = Math.max(0, ...D.feitas.filter((x) => x.exercicio_id === e.id).map((x) => Number(x.carga) || 0));
    if (antes && hoje > antes) n++;
  }
  return n;
}
function cartaoExercicio(ex, i, t) {
  const opcao = t.opcoes[ex.id] || 1;
  const feitas = D.feitas.filter((x) => x.exercicio_id === ex.id);
  const uv = ultimaVez(ex.id, opcao);
  const meta = metaReps(ex.reps);
  const ultimaHoje = feitas[feitas.length - 1];
  let base = uv.carga ?? ex.carga_prevista;
  if (opcao === 1 && ex.carga_prevista != null && uv.carga != null && Number(ex.carga_prevista) > Number(uv.carga)) base = ex.carga_prevista;
  const cargaPadrao = ultimaHoje?.carga ?? base ?? "";
  const total = Math.max(ex.series, feitas.length);
  const completo = feitas.length >= ex.series;
  const linhas = [];
  for (let n = 1; n <= total; n++) {
    const f = feitas.find((x) => x.numero === n);
    const ant = uv.porNum[n];
    const kk = `${ex.id}-${n}`;
    const vKg = f ? f.carga ?? "" : rasc[kk + "-kg"] ?? cargaPadrao;
    const vRp = f ? f.reps ?? "" : rasc[kk + "-rp"] ?? (ant?.reps ?? meta?.max ?? "");
    linhas.push(`<div class="serie ${f ? "feita" : ""}">
      <b class="num-s">${n}</b>
      <span class="ant">${ant ? `${fmt(ant.carga)} × ${ant.reps ?? "—"}` : "—"}</span>
      <input id="kg-${i}-${n}" type="number" inputmode="decimal" step="0.5" aria-label="Carga série ${n}" value="${h(vKg)}" ${f ? "disabled" : `data-muda="rascunho" data-k="${kk}-kg"`}>
      <input id="rp-${i}-${n}" type="number" inputmode="numeric" aria-label="Repetições série ${n}" value="${h(vRp)}" ${f ? "disabled" : `data-muda="rascunho" data-k="${kk}-rp"`}>
      <button class="ok" data-acao="feitoSerie" data-ex="${i}" data-n="${n}" aria-label="${f ? "Desfazer série " + n : "Concluir série " + n}">${ico("check", 18, 'stroke-width="3"')}</button></div>`);
  }
  const avisos = D.avisos.filter((a) => a.exId === ex.id).map((a) => a.tipo === "acima" ? `
    <div class="aviso-ex ac"><span>Subiu para <b>${kg(a.carga)}</b>. ${h(a.refTxt)}. Usar daqui pra frente?</span>
      <div class="linha" style="gap:6px"><button class="btn peq pri" data-acao="novaCarga" data-ex="${i}" data-carga="${a.carga}">Sim</button><button class="btn peq" data-acao="fecharAviso" data-id="${a.id}">Só hoje</button></div></div>` : `
    <div class="aviso-ex lar"><span>${h(a.txt)}</span><button class="ico" style="width:30px;height:30px" data-acao="fecharAviso" data-id="${a.id}" aria-label="Fechar aviso">✕</button></div>`).join("");
  const musc = [...new Set(musculosDe(ex.nome).map((m) => m.nome))].slice(0, 3).join(" · ");
  return `<div class="ex-bloco ${completo ? "completo" : ""}" id="ex-${i}">
    <div class="ex-cab">
      <button class="ex-foto" data-acao="exMais" data-ex="${i}" aria-label="Detalhes de ${h(ex.nome)}">${exImg(ex.nome)}</button>
      <button class="ex-tit" data-acao="exMais" data-ex="${i}"><b>${h(ex.nome)}</b><span>${musc || `${ex.series} × ${h(ex.reps)}`}</span></button>
      ${completo ? `<span class="ex-ok">${ico("check", 16, 'stroke-width="3"')}</span>` : ""}
      <button class="ico ex-mais" data-acao="exMais" data-ex="${i}" aria-label="Mais opções">⋯</button>
    </div>
    ${ex.obs ? `<span class="peq ac">${h(ex.obs)}</span>` : ""}
    <span class="ex-desc">${ico("relogio", 14)} Descanso: ${mmss(ex.descanso_seg)} · ${ex.series} × ${h(ex.reps)}${ex.carga_prevista ? " · ficha " + kg(ex.carga_prevista) : ""}</span>
    ${avisos}
    <div class="series"><div class="serie cab"><span>Série</span><span>Anterior</span><span>Kg</span><span>Reps</span><span>✓</span></div>${linhas.join("")}</div>
    <button class="btn peq blk add-serie" data-acao="maisSerie" data-ex="${i}">${ico("mais", 16)} Adicionar série</button>
  </div>`;
}
function desenharTreino(rolar = false) {
  const t = treinoAtivo();
  const n = D.exs.length;
  const exsFeitos = D.exs.filter((e) => D.feitas.filter((x) => x.exercicio_id === e.id).length >= e.series).length;
  const previstas = D.exs.reduce((s, e) => s + e.series, 0);
  const pct = Math.round((Math.min(D.feitas.length, previstas) / (previstas || 1)) * 100);
  const rec = recordesHoje();

  let resta = t.descansoAte ? (new Date(t.descansoAte) - Date.now()) / 1000 : null;
  if (resta !== null && resta < -120) { t.descansoAte = null; salvarTreinoAtivo(t); resta = null; }
  const fim = resta !== null && resta <= 0;
  const exDesc = t.descansoEx ? D.exs.find((e) => e.id === t.descansoEx) : null;
  const descanso = t.descansoAte ? `
    <div id="cardDescanso" class="faixa-desc ${fim ? "pronto" : ""}">
      <span id="cron" class="cron">${fim ? "Bora!" : mmss(resta)}</span>
      <span class="fd-info"><span id="rotDescanso">${fim ? "Descanso acabou · hora da próxima série" : "Descanso"}</span>${exDesc ? ` · ${h(exDesc.nome)}` : ""}
        <i><b id="barDescanso" style="width:${fim ? 0 : Math.max(0, (resta / (t.descansoTotal || 90)) * 100)}%"></b></i></span>
      <button class="fd-bt" data-acao="ajusteDescanso" data-s="-15">−15</button><button class="fd-bt" data-acao="ajusteDescanso" data-s="15">+15</button>
      <button class="fd-bt az" data-acao="pularDescanso">Continuar</button></div>` : "";

  const html = `<section class="tela treino-lista">
    <div class="treino-topo">
      <div class="tt-l1">${botaoVoltar("#/hoje")}<b class="tt-nome">${h(t.fichaNome)}</b><button class="btn pri tt-fim" data-acao="finalizar">Finalizar</button></div>
      <div class="tt-stats">
        <div><span>Duração</span><strong id="decorrido" class="ac">${mmss((Date.now() - new Date(D.s.inicio)) / 1000)}</strong></div>
        <div><span>Séries</span><strong>${D.feitas.length} de ${previstas}</strong></div>
        <div><span>Exercícios</span><strong>${exsFeitos} de ${n}</strong></div>
        <div><span>Recordes</span><strong>${rec ? "🏆 " + rec : "—"}</strong></div>
      </div>
      <div class="barra tt-barra"><div style="width:${pct}%"></div></div>
      <span id="filaInfo" class="fila-info" ${pendentes() ? "" : "hidden"}>Sem internet · ${pendentes()} registros guardados no celular</span>
    </div>
    ${D.exs.map((ex, i) => cartaoExercicio(ex, i, t)).join("")}
    <button class="btn perigo peq blk" data-acao="cancelarTreino" style="margin-top:8px">${ico("lixo", 16)} Cancelar treino</button>
  </section>
  ${descanso}`;
  rolar ? render(html) : renderSemRolar(html);
  preencherMidia();
}
// "⋯" do exercício: como fazer, aparelho, músculo e histórico de carga
acoes.exMais = (el) => {
  const t = treinoAtivo(); const i = Number(el.dataset.ex); const ex = D.exs[i];
  const opcao = t.opcoes[ex.id] || 1;
  const eq = D.eqs.find((e) => e.exercicio_id === ex.id && e.opcao === opcao);
  const fotoEq = eq?.foto_path ? D.urls?.[eq.foto_path] : null;
  const ms = musculosDe(ex.nome);
  const porSessao = new Map();
  [...D.hist.filter((x) => x.exercicio_id === ex.id)].reverse().forEach((x) => {
    const c = Number(x.carga) || 0, v = porSessao.get(x.sessao_id);
    if (!v) porSessao.set(x.sessao_id, { c, d: x.feita_em }); else if (c > v.c) v.c = c;
  });
  const pts = [...porSessao.values()].slice(-9);
  const maxHoje = Math.max(0, ...D.feitas.filter((x) => x.exercicio_id === ex.id).map((x) => Number(x.carga) || 0));
  if (maxHoje) pts.push({ c: maxHoje, d: new Date().toISOString() });
  abrirFolha(`<div class="entre"><h2>${h(ex.nome)}</h2><button class="ico" data-acao="fecharFolha" aria-label="Fechar">✕</button></div>
    <div class="ex-img-folha">${fotoEq ? `<img src="${h(fotoEq)}" alt="Foto do aparelho">` : exImg(ex.nome, "grande")}</div>
    <div class="grade2">
      <button class="btn" data-acao="comoFazer" data-nome="${h(ex.nome)}">${ico("play", 16)} Como fazer</button>
      <a class="btn" href="#/equip/${ex.id}">${ico("imagem", 16)} ${eq?.nome ? h(eq.nome.slice(0, 14)) : "Aparelho"}</a></div>
    ${ms.length ? `<div class="musc-ex">${corpoSvg(Object.fromEntries(ms.map((m) => [m.grupo, 1])))}<div class="col" style="gap:6px"><span class="rot">Músculo trabalhado</span>
      <div class="linha" style="gap:6px;flex-wrap:wrap">${[...new Set(ms.map((m) => m.nome))].map((m) => `<span class="chip ac">${h(m)}</span>`).join("")}</div></div></div>` : ""}
    ${pts.length >= 2 ? `<div class="cartao"><div class="entre"><b>Histórico de carga</b><span class="mini mudo">maior carga por treino</span></div>
      ${grafico(pts.map((x) => x.c), pts.map((x) => new Date(x.d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })))}</div>` : ""}`, ex.nome);
};

// lista de todos os exercícios para pular para qualquer um
acoes.listaExs = () => {
  const t = treinoAtivo();
  const itens = D.exs.map((e, i) => {
    const op = t.opcoes[e.id] || 1;
    const eqx = D.eqs.find((x) => x.exercicio_id === e.id && x.opcao === op) || D.eqs.find((x) => x.exercicio_id === e.id && x.foto_path);
    const foto = eqx?.foto_path ? D.urls?.[eqx.foto_path] : null;
    const feitas = D.feitas.filter((x) => x.exercicio_id === e.id).length;
    const ok = feitas >= e.series;
    return `<button class="item lista-ex ${i === t.idx ? "at" : ""}" data-acao="irExLista" data-i="${i}">
      <span class="lista-ft">${foto ? `<img src="${h(foto)}" alt="">` : `<b>${i + 1}</b>`}</span>
      <span class="col" style="flex:1;gap:2px;min-width:0"><b>${h(e.nome)}</b><span class="mini mudo">${e.series} × ${h(e.reps)}${eqx?.nome ? " · " + h(eqx.nome) : ""}</span></span>
      <span class="chip ${ok ? "cheio" : feitas ? "ac" : ""}">${ok ? "✓ feito" : `${feitas}/${e.series}`}</span></button>`;
  }).join("");
  abrirFolha(`<div class="entre"><h2>Exercícios do treino</h2><button class="ico" data-acao="fecharFolha" aria-label="Fechar">✕</button></div>
    <p class="mini mudo" style="margin:0">Toque para ir direto a qualquer exercício.</p><div class="col" style="gap:8px">${itens}</div>`, "Exercícios do treino");
};
acoes.irExLista = (el) => { fecharFolha(); acoes.irEx(el); };
acoes.verFoto = (el) => {
  abrirFolha(`<div class="entre"><h2>${h(el.dataset.tit || "Equipamento")}</h2><button class="ico" data-acao="fecharFolha" aria-label="Fechar">✕</button></div>
    <img class="foto-cheia" src="${h(el.dataset.src)}" alt="Foto do equipamento">`, "Foto do equipamento");
};
// como fazer: explicação por IA (guardada para todos) + vídeos reais no YouTube
const dicasCache = {};
acoes.comoFazer = async (el) => {
  const nome = el.dataset.nome;
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(nome + " execução correta academia")}`;
  const corpo = abrirFolha(`<div class="entre"><h2>${h(nome)}</h2><button class="ico" data-acao="fecharFolha" aria-label="Fechar">✕</button></div>
    <a class="btn pri blk" href="${yt}" target="_blank" rel="noopener">${ico("play", 18)} Ver vídeos de como fazer</a>
    <div id="dicas" class="col" style="gap:12px"><div class="cartao"><span class="mudo peq">Preparando a explicação…</span><div class="barra"><div class="carregando-barra"></div></div></div></div>`, "Como fazer");
  const alvo = corpo.querySelector("#dicas");
  try {
    let r = dicasCache[nome];
    if (!r) {
      const { data, error } = await sb.functions.invoke("como-fazer", { body: { nome } });
      if (error) { let m = "Não consegui carregar a explicação"; try { m = (await error.context.json()).erro || m; } catch { /* */ } throw new Error(m); }
      r = dicasCache[nome] = data.resultado;
    }
    if (!document.body.contains(alvo)) return;
    if (r.desconhecido) { alvo.innerHTML = `<div class="cartao"><span class="peq mudo">Não reconheci esse nome de exercício. Use os vídeos acima.</span></div>`; return; }
    const lista = (xs, cls) => (xs || []).map((x, i) => `<li class="${cls}"><span>${cls === "passo" ? i + 1 : "✕"}</span><p>${h(x)}</p></li>`).join("");
    alvo.innerHTML = `
      ${r.musculos?.length ? `<div class="linha" style="gap:6px;flex-wrap:wrap">${r.musculos.map((m) => `<span class="chip ac">${h(m)}</span>`).join("")}</div>` : ""}
      <div class="cartao"><b>Passo a passo</b><ol class="passos">${lista(r.passos, "passo")}</ol></div>
      ${r.erros?.length ? `<div class="cartao"><b>Evite</b><ul class="passos">${lista(r.erros, "erro")}</ul></div>` : ""}
      ${r.dica ? `<div class="cartao ac-borda"><div class="linha" style="align-items:flex-start"><span class="ac">${ico("info", 18)}</span><span class="peq">${h(r.dica)}</span></div></div>` : ""}
      <span class="mini mudo">Explicação gerada por IA. Na dúvida, peça ajuda ao professor da academia.</span>`;
  } catch (e) {
    if (document.body.contains(alvo)) alvo.innerHTML = `<div class="cartao"><span class="peq lar">${h(e.message || "Não consegui carregar a explicação")}</span><span class="mini mudo">Os vídeos acima continuam funcionando.</span></div>`;
  }
};
let verAparelho = false;
acoes.midiaAba = (el) => { verAparelho = el.dataset.v === "1"; desenharTreino(); };
acoes.irEx = (el) => { document.getElementById(`ex-${el.dataset.i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
acoes.maisSerie = async (el) => {
  const ex = D.exs[Number(el.dataset.ex)];
  ex.series += 1; desenharTreino();
};
acoes.feitoSerie = async (el) => {
  destravarAudio();
  const t = treinoAtivo();
  const iEx = Number(el.dataset.ex); t.idx = iEx;
  const ex = D.exs[iEx];
  const n = Number(el.dataset.n);
  const opcao = t.opcoes[ex.id] || 1;
  const ja = D.feitas.find((x) => x.exercicio_id === ex.id && x.numero === n);
  if (ja) { // desfazer
    enfileirar({ tipo: "del", tab: "series_feitas", id: ja.id });
    D.feitas = D.feitas.filter((x) => x.id !== ja.id);
    t.feitas = D.feitas; salvarTreinoAtivo(t);
    return desenharTreino();
  }
  const carga = num(document.getElementById(`kg-${iEx}-${n}`).value);
  const reps = num(document.getElementById(`rp-${iEx}-${n}`).value);
  const agora = new Date();
  const descanso = t.ultimaSerie ? Math.round((agora - new Date(t.ultimaSerie)) / 1000) : null;
  const linha = {
    id: idNovo(), sessao_id: t.sessaoId, exercicio_id: ex.id, exercicio_nome: ex.nome, equipamento_opcao: opcao, numero: n,
    carga, reps: reps === null ? null : Math.round(reps), descanso_seg: descanso && descanso < 1800 ? descanso : null, feita_em: agora.toISOString(),
  };
  enfileirar({ tipo: "ins", tab: "series_feitas", id: linha.id, dados: { ...linha } });
  D.feitas.push(linha);
  t.feitas = D.feitas;
  t.ultimaSerie = agora.toISOString();
  const feitasEx = D.feitas.filter((x) => x.exercicio_id === ex.id).length;
  if (feitasEx < ex.series || t.idx + 1 < D.exs.length) {
    t.descansoAte = new Date(agora.getTime() + ex.descanso_seg * 1000).toISOString();
    t.descansoTotal = ex.descanso_seg;
    t.descansoEx = ex.id;
  } else t.descansoAte = null;
  salvarTreinoAtivo(t);

  // ---- recorde na hora: maior carga que já fez neste exercício ----
  const maxAntes = Math.max(0, ...D.hist.filter((x) => x.exercicio_id === ex.id).map((x) => Number(x.carga) || 0));
  const maxHoje = Math.max(0, ...D.feitas.filter((x) => x.exercicio_id === ex.id && x.id !== linha.id).map((x) => Number(x.carga) || 0));
  if (carga && maxAntes && carga > maxAntes && carga > maxHoje) comemorar("Novo recorde!", `${ex.nome}: ${kg(carga)} (antes ${kg(maxAntes)})`);

  // ---- avisos: acima ou abaixo da ficha ----
  const uv = ultimaVez(ex.id, opcao);
  const ref = ex.carga_prevista ?? uv.max;
  if (carga !== null && ref && carga > Number(ref) && !D.avisouAcima[ex.id]) {
    D.avisouAcima[ex.id] = true;
    D.avisos.push({ id: Math.random().toString(36).slice(2), exId: ex.id, tipo: "acima", n, carga,
      refTxt: ex.carga_prevista ? `A ficha previa ${kg(ex.carga_prevista)}` : `Seu máximo era ${kg(uv.max)}` });
  }
  if (carga !== null && ex.carga_prevista && carga < Number(ex.carga_prevista)) {
    D.avisos.push({ id: Math.random().toString(36).slice(2), exId: ex.id, tipo: "menosCarga", txt: `Série ${n} com ${kg(carga)} (ficha: ${kg(ex.carga_prevista)}).` });
  }
  const meta = metaReps(ex.reps);
  if (meta && reps !== null && reps < meta.min) {
    const anterior = D.feitas.find((x) => x.exercicio_id === ex.id && x.numero === n - 1);
    const seguidas = anterior && anterior.reps !== null && anterior.reps < meta.min;
    D.avisos.push({ id: Math.random().toString(36).slice(2), exId: ex.id, tipo: "abaixo",
      txt: `Série ${n} com ${reps} repetições (meta ${meta.min === meta.max ? meta.min : meta.min + "–" + meta.max}).` + (seguidas ? " Duas séries seguidas abaixo: vale baixar um pouco a carga." : "") });
  }
  desenharTreino();
  if (feitasEx === ex.series && iEx + 1 < D.exs.length) setTimeout(() => document.getElementById(`ex-${iEx + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
};
acoes.fecharAviso = (el) => { D.avisos = D.avisos.filter((a) => a.id !== el.dataset.id); desenharTreino(); };
acoes.novaCarga = async (el) => {
  const ex = D.exs[Number(el.dataset.ex)]; const carga = num(el.dataset.carga);
  enfileirar({ tipo: "upd", tab: "exercicios", id: ex.id, dados: { carga_prevista: carga } });
  ex.carga_prevista = carga;
  D.avisos = D.avisos.filter((a) => !(a.exId === ex.id && a.tipo === "acima"));
  toast(`Nova carga: ${kg(carga)}`); desenharTreino();
};
acoes.ajusteDescanso = (el) => {
  const t = treinoAtivo(); if (!t.descansoAte) return;
  t.descansoAte = new Date(new Date(t.descansoAte).getTime() + Number(el.dataset.s) * 1000).toISOString();
  t.descansoTotal = Math.max(15, (t.descansoTotal || 90) + Number(el.dataset.s));
  salvarTreinoAtivo(t); desenharTreino();
};
acoes.pularDescanso = () => { const t = treinoAtivo(); t.descansoAte = null; salvarTreinoAtivo(t); desenharTreino(); };
// cancela sem finalizar: apaga o treino e as séries marcadas (não conta no histórico)
acoes.cancelarTreino = () => {
  const t = treinoAtivo(); if (!t) return ir("#/hoje");
  const n = (t.feitas || []).length;
  if (!confirm(n ? `Cancelar este treino? As ${n} séries marcadas serão apagadas e ele não conta no histórico.` : "Cancelar este treino?")) return;
  enfileirar({ tipo: "del", tab: "sessoes", id: t.sessaoId });
  salvarTreinoAtivo(null); D = null;
  toast("Treino cancelado"); ir("#/hoje");
};
acoes.finalizar = async () => {
  const t = treinoAtivo();
  if (!D.feitas.length) {
    if (!confirm("Nenhuma série marcada. Descartar este treino?")) return;
    enfileirar({ tipo: "del", tab: "sessoes", id: t.sessaoId });
    salvarTreinoAtivo(null); D = null; return ir("#/hoje");
  }
  const faltam = D.exs.map((e) => ({ e, n: D.feitas.filter((x) => x.exercicio_id === e.id).length })).filter((x) => x.n < x.e.series);
  if (faltam.length) {
    const lista = faltam.slice(0, 8).map((x) => `• ${x.e.nome} (${x.n} de ${x.e.series} séries)`).join("\n") + (faltam.length > 8 ? `\n… e mais ${faltam.length - 8}` : "");
    if (!confirm(`Falta${faltam.length > 1 ? "m" : ""} ${faltam.length} exercício${faltam.length > 1 ? "s" : ""}:\n\n${lista}\n\nTem certeza que deseja concluir mesmo assim?`)) return;
  }
  enfileirar({ tipo: "upd", tab: "sessoes", id: t.sessaoId, dados: { fim: new Date().toISOString() } });
  salvarTreinoAtivo(null); D = null;
  if (await enviar()) {
    toast("Sem internet: o treino ficou salvo no celular e vai ser enviado quando a internet voltar", 6000);
    return ir("#/hoje");
  }
  ir(`#/fim/${t.sessaoId}`);
};

// ---------- OPÇÕES DE EQUIPAMENTO ----------
let selEquip = {};
export async function telaEquipamento(exId) {
  const ex = q(await sb.from("exercicios").select("*").eq("id", exId).single());
  const eqs = q(await sb.from("equipamentos").select("*").eq("exercicio_id", exId));
  const hist = q(await sb.from("series_feitas").select("equipamento_opcao, carga, feita_em").eq("exercicio_id", exId).order("feita_em", { ascending: false }).limit(200));
  const t = treinoAtivo();
  const emTreino = t && D && D.exs.some((e) => e.id === exId);
  const sel = selEquip[exId] || (emTreino ? t.opcoes[exId] : null) || 1;
  const urls = await fotoUrls(eqs.map((e) => e.foto_path));
  const op = (n) => eqs.find((e) => e.opcao === n);
  const ultCarga = (n) => hist.find((x) => x.equipamento_opcao === n)?.carga ?? null;
  const at = op(sel);
  const voltar = emTreino ? "#/treino" : `#/ex/${exId}`;

  render(`<section class="tela">
    <div class="topo">${botaoVoltar(voltar)}<div class="tit"><h2>${h(ex.nome)}</h2><span class="mini mudo">${ex.series} × ${h(ex.reps)} · escolha o equipamento</span></div></div>
    <div class="foto-g">${at?.foto_path && urls[at.foto_path] ? `<img src="${urls[at.foto_path]}" alt="Foto do equipamento, opção ${sel}">` : `${ico("camera", 44)}<span class="peq">Sem foto ainda</span>`}
      <span class="chip cheio">Opção ${sel}</span></div>
    <div class="grade2"><button class="btn" data-acao="fotoEquip" data-ex="${exId}" data-op="${sel}" data-cam="1">${ico("camera", 18)} Tirar foto</button>
      <button class="btn" data-acao="fotoEquip" data-ex="${exId}" data-op="${sel}">${ico("imagem", 18)} Da galeria</button></div>
    <div class="cartao"><div class="entre"><span class="rot">Opção ${sel}</span><span class="peq">Última carga: <b class="ac">${kg(ultCarga(sel))}</b></span></div>
      <label class="campo">Nome do aparelho<input class="inp" value="${h(at?.nome || "")}" placeholder="Ex.: Polia alta, barra larga" data-muda="campoEquip" data-ex="${exId}" data-op="${sel}" data-campo="nome"></label>
      <label class="campo">Onde fica<input class="inp" value="${h(at?.local || "")}" placeholder="Ex.: Máquina 12, fundo da sala" data-muda="campoEquip" data-ex="${exId}" data-op="${sel}" data-campo="local"></label></div>
    <div class="grade3">${[1, 2, 3].map((n) => { const e = op(n); return `<button class="opc ${n === sel ? "at" : ""}" data-acao="selEquip" data-ex="${exId}" data-op="${n}" aria-label="Escolher opção ${n}">
      <span class="ft">${e?.foto_path && urls[e.foto_path] ? `<img src="${urls[e.foto_path]}" alt="">` : ico(e ? "imagem" : "mais", 22)}</span>
      <b class="mini ${n === sel ? "ac" : ""}">Opção ${n}</b><span class="mini mudo">${h(e?.nome || (e ? "Sem nome" : "Adicionar"))}</span>
      <span class="mini">${kg(ultCarga(n))}</span></button>`; }).join("")}</div>
    <div class="cartao tracejado"><div class="linha" style="align-items:flex-start"><span class="ac">${ico("info", 20)}</span>
      <span class="peq mudo">Cada opção guarda a <b style="color:var(--txt)">própria carga</b>: o mesmo peso na polia não pesa igual na máquina. Se o aparelho estiver ocupado, é só trocar.</span></div></div>
  </section>
  ${emTreino ? `<div class="rodape"><div><button class="btn pri" data-acao="usarEquip" data-ex="${exId}" data-op="${sel}">Usar opção ${sel} agora</button></div></div>` : ""}`);
}
acoes.selEquip = (el) => { selEquip[el.dataset.ex] = Number(el.dataset.op); telaEquipamento(el.dataset.ex); };
acoes.usarEquip = (el) => {
  const t = treinoAtivo(); t.opcoes[el.dataset.ex] = Number(el.dataset.op); salvarTreinoAtivo(t);
  delete selEquip[el.dataset.ex]; ir("#/treino");
};
async function salvarEquip(exId, opcao, campos) {
  const r = q(await sb.from("equipamentos").upsert({ exercicio_id: exId, opcao, ...campos }, { onConflict: "exercicio_id,opcao" }).select().single());
  if (D) { D.eqs = D.eqs.filter((e) => !(e.exercicio_id === exId && e.opcao === opcao)); D.eqs.push(r); }
  if (D && r.foto_path) D.urls = { ...(D.urls || {}), ...(await fotoUrls([r.foto_path])) };
  return r;
}
mudancas.campoEquip = async (el) => {
  await salvarEquip(el.dataset.ex, Number(el.dataset.op), { [el.dataset.campo]: el.value.trim() });
  toast("Salvo");
};
acoes.fotoEquip = async (el) => {
  const file = await escolherFoto({ camera: !!el.dataset.cam });
  if (!file) return;
  toast("Enviando foto…");
  const blob = await reduzir(file, 1280);
  const path = await enviarFoto(blob, "equipamentos");
  await salvarEquip(el.dataset.ex, Number(el.dataset.op), { foto_path: path });
  selEquip[el.dataset.ex] = Number(el.dataset.op);
  toast("Foto salva"); telaEquipamento(el.dataset.ex);
};

// ---------- TREINO CONCLUÍDO ----------
async function resumoSessao(id) {
  const s = q(await sb.from("sessoes").select("*").eq("id", id).single());
  const ser = q(await sb.from("series_feitas").select("*").eq("sessao_id", id).order("feita_em"));
  const volume = ser.reduce((a, x) => a + (Number(x.carga) || 0) * (Number(x.reps) || 0), 0);
  const ids = [...new Set(ser.map((x) => x.exercicio_id).filter(Boolean))];
  const antes = ids.length ? q(await sb.from("series_feitas").select("exercicio_id, carga").in("exercicio_id", ids).lt("feita_em", s.inicio)) : [];
  const recordes = [];
  ids.forEach((exId) => {
    const hoje = ser.filter((x) => x.exercicio_id === exId);
    const maxHoje = Math.max(...hoje.map((x) => Number(x.carga) || 0));
    const ant = antes.filter((x) => x.exercicio_id === exId).map((x) => Number(x.carga) || 0);
    if (ant.length && maxHoje > Math.max(...ant)) {
      const melhor = hoje.filter((x) => Number(x.carga) === maxHoje).sort((a, b) => (b.reps || 0) - (a.reps || 0))[0];
      recordes.push({ nome: melhor.exercicio_nome, carga: maxHoje, reps: melhor.reps, ganho: maxHoje - Math.max(...ant) });
    }
  });
  const desc = ser.filter((x) => x.descanso_seg).map((x) => x.descanso_seg);
  const descMedio = desc.length ? desc.reduce((a, b) => a + b, 0) / desc.length : null;
  return { s, ser, volume, recordes, descMedio };
}
export const volumeTxt = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;

export async function telaFim(id) {
  const { s, ser, volume, recordes, descMedio } = await resumoSessao(id);
  const foto = s.foto_path ? await fotoUrl(s.foto_path) : null;
  const hm = (d) => d ? new Date(d).toTimeString().slice(0, 5) : "";
  render(`<section class="tela">
    <div class="col" style="gap:6px"><span class="rot ac">Treino concluído</span><h1>${h(s.ficha_nome || "Treino")}</h1>
      <span class="peq mudo">${new Date(s.inicio).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span></div>
    <div class="cartao" style="display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end;gap:8px">
      <label class="col" style="gap:2px"><span class="mini mudo">Início</span><input class="inp num" style="font-size:20px;font-weight:700;padding:0 6px;min-width:0" type="time" value="${hm(s.inicio)}" data-muda="horaSessao" data-id="${s.id}" data-campo="inicio"></label>
      <span class="chip ac" style="margin-bottom:12px">${s.fim ? duracao(s.inicio, s.fim) : "—"}</span>
      <label class="col" style="gap:2px"><span class="mini mudo">Fim</span><input class="inp num" style="font-size:20px;font-weight:700;padding:0 6px;min-width:0" type="time" value="${hm(s.fim)}" data-muda="horaSessao" data-id="${s.id}" data-campo="fim"></label></div>
    <span class="mini mudo" style="margin-top:-8px">Marcados ao tocar em Iniciar e Finalizar. Toque no horário para corrigir.</span>
    <div class="grade3"><div class="stat"><span class="mini mudo">Séries</span><span class="v">${ser.length}</span></div>
      <div class="stat"><span class="mini mudo">Volume</span><span class="v">${volumeTxt(volume)}</span></div>
      <div class="stat"><span class="mini mudo">Recordes</span><span class="v ac">${recordes.length}</span></div></div>
    ${recordes.length ? `<div class="cartao">${recordes.map((r) => `<div class="entre"><span>${h(r.nome)}</span><b>${kg(r.carga)} <span class="ac">+${fmt(r.ganho)}</span></b></div>`).join("")}</div>` : ""}
    ${descMedio ? `<span class="peq mudo">Descanso médio entre séries: <b style="color:var(--txt)">${mmss(descMedio)}</b></span>` : ""}
    <div class="col"><h3>Foto do final do treino</h3>
      <button class="foto-fim" data-acao="fotoFim" data-id="${s.id}">${foto ? `<img src="${foto}" alt="Foto do final do treino">` : `${ico("camera", 40, 'style="color:var(--ac)"')}<b style="color:var(--txt)">Tirar foto ou escolher da galeria</b><span class="mini">Fica salva no histórico, mesmo sem publicar</span>`}</button>
      ${foto ? `<button class="btn peq" data-acao="fotoFim" data-id="${s.id}">${ico("camera", 16)} Trocar foto</button>` : ""}</div>
    <button class="btn perigo peq" data-acao="apagarSessao" data-id="${s.id}">${ico("lixo", 16)} Apagar este treino</button>
  </section>
  <div class="rodape"><div><a class="btn" href="#/hoje">Só salvar</a><a class="btn pri" href="#/publicar/${s.id}">${ico("share", 18)} Publicar</a></div></div>`);
  // comemoração só na primeira vez que esta tela abre para este treino
  let jaFesta = false;
  try { jaFesta = !!sessionStorage.getItem("festa-" + s.id); sessionStorage.setItem("festa-" + s.id, "1"); } catch { /* */ }
  if (!jaFesta && s.fim && Date.now() - new Date(s.fim) < 30 * 60000) {   // só logo depois de terminar (não ao abrir pelo histórico)
    if (recordes.length) comemorar(recordes.length === 1 ? "Novo recorde!" : `${recordes.length} recordes!`, recordes.map((r) => `${r.nome} ${kg(r.carga)}`).join(" · "));
    import("./conquistas.js").then((m) => m.checarConquistas(recordes.length ? 3800 : 0)).catch(() => {});
  }
}
mudancas.horaSessao = async (el) => {
  if (!el.value) return;
  const s = q(await sb.from("sessoes").select("inicio, fim").eq("id", el.dataset.id).single());
  const base = new Date(s.inicio);
  const [hh, mm] = el.value.split(":").map(Number);
  base.setHours(hh, mm, 0, 0);
  q(await sb.from("sessoes").update({ [el.dataset.campo]: base.toISOString() }).eq("id", el.dataset.id));
  toast("Horário corrigido"); telaFim(el.dataset.id);
};
acoes.fotoFim = async (el) => {
  const file = await escolherFoto();
  if (!file) return;
  toast("Enviando foto…");
  const path = await enviarFoto(await reduzir(file, 1600, 0.85), "treinos");
  q(await sb.from("sessoes").update({ foto_path: path }).eq("id", el.dataset.id));
  toast("Foto salva"); telaFim(el.dataset.id);
};
acoes.apagarSessao = async (el) => {
  if (!confirm("Apagar este treino do histórico?")) return;
  q(await sb.from("sessoes").delete().eq("id", el.dataset.id));
  toast("Treino apagado"); ir("#/hoje");
};

// ---------- PUBLICAR ----------
let formato = "story";
let ultimaImagem = null;
export async function telaPublicar(id) {
  const r = await resumoSessao(id);
  const foto = r.s.foto_path ? await fotoUrl(r.s.foto_path) : null;
  const comFoto = formato !== "numeros";
  render(`<section class="tela">
    <div class="topo">${botaoVoltar(`#/fim/${id}`)}<div class="tit"><h2>Publicar treino</h2></div></div>
    <canvas id="cv" class="prev${comFoto ? " toque" : ""}" ${comFoto ? `data-acao="fotoPublicar" data-id="${id}" role="button"` : ""} aria-label="Prévia da imagem para publicar${comFoto ? ". Toque para escolher a foto" : ""}"></canvas>
    <div class="abas">${[["story", "Story"], ["post", "Post"], ["numeros", "Só números"]].map(([k, t]) => `<button class="${formato === k ? "at" : ""}" data-acao="formato" data-f="${k}" data-id="${id}">${t}</button>`).join("")}</div>
    ${comFoto ? `<button class="btn" data-acao="fotoPublicar" data-id="${id}">${ico("camera", 18)} ${foto ? "Trocar foto" : "Escolher foto do treino"}</button>` : ""}
  </section>
  <div class="rodape"><div><button class="btn" data-acao="salvarImg">Salvar imagem</button><button class="btn pri" data-acao="compartilhar">${ico("share", 18)} Compartilhar</button></div></div>`);
  await desenharCard(r, foto);
}
acoes.formato = (el) => { formato = el.dataset.f; telaPublicar(el.dataset.id); };
acoes.fotoPublicar = async (el) => {
  const file = await escolherFoto();
  if (!file) return;
  toast("Enviando foto…");
  const path = await enviarFoto(await reduzir(file, 1600, 0.85), "treinos");
  q(await sb.from("sessoes").update({ foto_path: path }).eq("id", el.dataset.id));
  toast("Foto salva"); telaPublicar(el.dataset.id);
};

// ícones (traço, grade 24×24) desenhados no canvas
const ICONES = {
  calendario: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18"],
  halter: ["M6.5 6h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "M3.5 8.5h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
    "M16.5 6h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "M19.5 8.5h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
    "M8.5 12h7", "M1 12h1.5", "M21.5 12H23"],
  cronometro: ["M10 2h4", "M12 14l3-3", "M20 14a8 8 0 1 1-16 0a8 8 0 1 1 16 0", "M19 5l1.5 1.5"],
  relogio: ["M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0", "M12 6.5V12l3.5 2"],
  trofeu: ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16", "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22", "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22", "M18 2H6v7a6 6 0 0 0 12 0V2Z"],
  camera: ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z", "M15 13a3 3 0 1 1-6 0a3 3 0 1 1 6 0"],
};
function icone(c, nome, x, y, tam, cor, larg = 1.8) {
  c.save(); c.translate(x, y); c.scale(tam / 24, tam / 24);
  c.strokeStyle = cor; c.lineWidth = larg; c.lineCap = "round"; c.lineJoin = "round";
  ICONES[nome].forEach((d) => c.stroke(new Path2D(d)));
  c.restore();
}
// escreve e diminui a fonte até caber na largura
function caber(c, txt, max, peso, tam, fam) {
  let t = tam;
  do { c.font = `${peso} ${t}px ${fam}`; t -= 2; } while (c.measureText(txt).width > max && t > 18);
}

const AZUL = "#84CC16", CIANO = "#AAF807", TXT = "#F2F5FA", MUDO = "#9AA6BC";
const SANS = "Inter, sans-serif", TIT = "'Space Grotesk', Inter, sans-serif";

// Semana de treino: de domingo 20h até o domingo seguinte 20h (igual ao Perfil)
function inicioSemanaTreino(d = new Date()) {
  const x = new Date(d); x.setHours(20, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  if (x > d) x.setDate(x.getDate() - 7);
  return x;
}
// Dados extras do card: comparação com o último treino da mesma ficha e quantos treinos na semana
async function extrasDoCard({ s, ser: serHoje }) {
  const extras = { link: location.host };
  const ini = new Date(s.inicio);
  const [semana, ant] = await Promise.all([
    sb.from("sessoes").select("id, series_feitas(count)").not("fim", "is", null)
      .gte("inicio", inicioSemanaTreino(ini).toISOString()).lte("inicio", s.inicio),
    s.ficha_id ? sb.from("sessoes").select("id").eq("ficha_id", s.ficha_id).not("fim", "is", null)
      .lt("inicio", s.inicio).order("inicio", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const n = (semana.data || []).filter((x) => x.series_feitas?.[0]?.count > 0 || x.id === s.id).length;
  if (n) extras.semana = n;
  const antId = ant.data?.[0]?.id;
  if (antId) {
    const ant = q(await sb.from("series_feitas").select("exercicio_id, carga").eq("sessao_id", antId));
    const maior = (xs, id) => Math.max(0, ...xs.filter((x) => x.exercicio_id === id).map((x) => Number(x.carga) || 0));
    const ids = [...new Set(serHoje.map((x) => x.exercicio_id).filter(Boolean))];
    const subiu = ids.filter((id) => { const a = maior(ant, id); return a > 0 && maior(serHoje, id) > a; }).length;   // mais carga que da última vez nesta ficha
    if (subiu) extras.subiu = subiu;
  }
  return extras;
}
async function desenharCard(r, foto) {
  const cv = document.getElementById("cv"); if (!cv) return;
  const W = 1080, H = formato === "story" ? 1920 : formato === "post" ? 1350 : 1080;
  cv.width = W; cv.height = H;
  try { await document.fonts.ready; } catch { /* */ }
  let img = null;
  if (foto && formato !== "numeros") { try { img = await carregarImagem(foto); } catch { /* foto indisponível */ } }
  const extras = await extrasDoCard(r).catch(() => ({ link: location.host }));
  pintar(cv.getContext("2d"), W, H, r, img, true, extras);
  // a imagem que vai para o compartilhamento não leva o "toque para adicionar"
  if (!img && formato !== "numeros") {
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    pintar(off.getContext("2d"), W, H, r, null, false, extras);
    ultimaImagem = await new Promise((ok) => off.toBlob(ok, "image/jpeg", 0.92));
  } else ultimaImagem = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92));
}

// grupos trabalhados nas séries feitas, do mais para o menos. Ex.: "Peito, Costas, Ombro e Braço"
function gruposTreinados(ser) {
  const cont = {};
  ser.forEach((x) => {
    let g = grupoDe(x.exercicio_nome || "");
    if (g === "Outros") return;
    if (g === "Pernas") g = "Perna";
    cont[g] = (cont[g] || 0) + 1;
  });
  const gs = Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 4);
  return gs.length <= 1 ? gs[0] || "" : gs.slice(0, -1).join(", ") + " e " + gs[gs.length - 1];
}
function pintar(c, W, H, { s, ser, volume, recordes }, img, previa, extras = {}) {
  const M = 56;
  const k = H < 1500;   // post/quadrado: tudo mais compacto para sobrar espaço para a foto
  // fundo azul-escuro com brilhos
  const fundo = c.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, "#0E1608"); fundo.addColorStop(0.55, "#0A1006"); fundo.addColorStop(1, "#060904");
  c.fillStyle = fundo; c.fillRect(0, 0, W, H);
  const brilho = (x, y, raio, cor) => { const g = c.createRadialGradient(x, y, 0, x, y, raio); g.addColorStop(0, cor); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H); };
  brilho(0, 0, 520, "rgba(101,163,13,.45)");
  brilho(W, H * 0.55, 620, "rgba(101,163,13,.22)");
  brilho(W * 0.3, H, 700, "rgba(170,248,7,.07)");
  c.textBaseline = "alphabetic"; c.textAlign = "left";

  // topo: marca e etiqueta do treino
  icone(c, "halter", M + 8, 52, 72, CIANO, 1.9);
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(M + 104, 62, 3, 52);
  c.fillStyle = TXT; c.font = `700 46px ${TIT}`; c.fillText("Meu Treino", M + 134, 104);
  const nome = s.ficha_nome || "Treino";
  const letra = (nome.match(/Treino\s+(\S+)/) || [])[1] || "";
  if (letra) {
    c.font = `700 38px ${SANS}`;
    const txt = `Treino ${letra}`, tw = c.measureText(txt).width + 72;
    const g = c.createLinearGradient(W - M - tw, 0, W - M, 0); g.addColorStop(0, "#65A30D"); g.addColorStop(1, AZUL);
    c.save(); c.shadowColor = "rgba(132,204,22,.55)"; c.shadowBlur = 30;
    c.fillStyle = g; roundRect(c, W - M - tw, 54, tw, 70, 35); c.fill(); c.restore();
    c.strokeStyle = "rgba(217,249,157,.5)"; c.lineWidth = 2; roundRect(c, W - M - tw, 54, tw, 70, 35); c.stroke();
    c.fillStyle = "#fff"; c.fillText(txt, W - M - tw + 36, 103);
  }
  const titulo = gruposTreinados(ser) || nome.replace(/^Treino\s+\S+\s*·?\s*/, "") || nome;
  const nEx = new Set(ser.map((x) => x.exercicio_id || x.exercicio_nome)).size;

  // de baixo para cima: recorde, números, título, data
  let y = H - M;
  // marca d'água com o link do app
  if (extras.link) {
    c.textAlign = "center"; c.fillStyle = "rgba(201,211,230,.55)"; c.font = `500 ${k ? 24 : 26}px ${SANS}`;
    c.fillText(extras.link, W / 2, y + 22); c.textAlign = "left";
    y -= k ? 22 : 30;
  }
  if (recordes.length > 1 && k) {
    // compacto: até 3 recordes lado a lado
    const rs = recordes.slice(0, 3), ch = 178, top = y - ch, cw = (W - 2 * M - 48) / rs.length;
    c.save(); c.shadowColor = "rgba(34,211,238,.35)"; c.shadowBlur = 36;
    c.fillStyle = "rgba(18,30,10,.75)"; roundRect(c, M, top, W - 2 * M, ch, 26); c.fill(); c.restore();
    const borda = c.createLinearGradient(M, 0, W - M, 0); borda.addColorStop(0, CIANO); borda.addColorStop(1, AZUL);
    c.strokeStyle = borda; c.lineWidth = 3; roundRect(c, M, top, W - 2 * M, ch, 26); c.stroke();
    icone(c, "trofeu", M + 26, top + 22, 38, CIANO, 2);
    c.fillStyle = "#C9D3E6"; c.font = `700 24px ${SANS}`;
    if ("letterSpacing" in c) c.letterSpacing = "4px";
    c.fillText(`${rs.length} RECORDES PESSOAIS`, M + 80, top + 50);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    rs.forEach((r, i) => {
      const x0 = M + 24 + i * cw;
      if (i) { c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(x0 - 12, top + 78, 2, ch - 100); }
      caber(c, r.nome, cw - 24, 600, 28, SANS); c.fillStyle = TXT; c.fillText(r.nome, x0 + 4, top + 108);
      const val = `${fmt(r.carga)} kg${r.reps ? " × " + r.reps : ""}`;
      caber(c, val, cw - 24, 700, 40, SANS); c.fillStyle = CIANO; c.fillText(val, x0 + 4, top + 154);
    });
    y = top - 34;
  } else if (recordes.length) {
    const rs = recordes.slice(0, 3), linha = 64, ch = 96 + rs.length * linha, top = y - ch;
    c.save(); c.shadowColor = "rgba(34,211,238,.35)"; c.shadowBlur = 36;
    c.fillStyle = "rgba(18,30,10,.75)"; roundRect(c, M, top, W - 2 * M, ch, 26); c.fill(); c.restore();
    const borda = c.createLinearGradient(M, 0, W - M, 0); borda.addColorStop(0, CIANO); borda.addColorStop(1, AZUL);
    c.strokeStyle = borda; c.lineWidth = 3; roundRect(c, M, top, W - 2 * M, ch, 26); c.stroke();
    icone(c, "trofeu", M + 50, top + (ch - 66) / 2, 66, CIANO, 1.8);
    c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(M + 154, top + 38, 2, ch - 76);
    c.fillStyle = "#C9D3E6"; c.font = `700 28px ${SANS}`;
    if ("letterSpacing" in c) c.letterSpacing = "5px";
    c.fillText(rs.length > 1 ? `${rs.length} RECORDES PESSOAIS` : "RECORDE PESSOAL", M + 190, top + 62);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    rs.forEach((r, i) => {
      const yy = top + 62 + (i + 1) * linha;
      const val = `${fmt(r.carga)} kg${r.reps ? " × " + r.reps : ""}`;
      const tam = rs.length > 1 ? 42 : 50;
      c.font = `700 ${tam}px ${SANS}`; const vw = c.measureText(val).width;
      c.fillStyle = CIANO; c.fillText(val, W - M - 40 - vw, yy);
      caber(c, r.nome, W - 2 * M - 190 - 40 - vw - 28, 700, tam, SANS);
      c.fillStyle = TXT; c.fillText(r.nome, M + 190, yy);
    });
    y = top - 40;
  }
  // comparação com o último treino desta ficha
  if (extras.subiu) {
    const n = extras.subiu;
    c.font = `600 ${k ? 30 : 34}px ${SANS}`; c.fillStyle = "#4ADE80";
    c.fillText(`▲ Subiu a carga em ${n} exercício${n > 1 ? "s" : ""}`, M + 8, y);
    y -= k ? 46 : 56;
  }
  // três cartões de números
  const sh = k ? 124 : 146, stop = y - sh, gap = 18, livre = W - 2 * M - 2 * gap;
  // sem recorde: só Duração e Data (as séries já aparecem na linha de cima)
  const dados = [["cronometro", "Duração", s.fim ? duracao(s.inicio, s.fim) : "—"],
    ...(recordes.length ? [["trofeu", "Recordes", String(recordes.length)]] : []),
    ["calendario", "Data", new Date(s.inicio).toLocaleDateString("pt-BR")]];
  const larg = (dados.length === 3 ? [0.31, 0.29, 0.40] : [0.42, 0.58]).map((p) => p * (W - 2 * M - (dados.length - 1) * gap));
  let x = M;
  dados.forEach(([ic, rot, v], i) => {
    const w = larg[i];
    c.fillStyle = "rgba(20,32,12,.55)"; roundRect(c, x, stop, w, sh, 22); c.fill();
    c.strokeStyle = "rgba(170,248,7,.28)"; c.lineWidth = 2; roundRect(c, x, stop, w, sh, 22); c.stroke();
    const it = k ? 52 : 60;
    icone(c, ic, x + 26, stop + (sh - it) / 2, it, CIANO, 1.7);
    c.fillStyle = "#C9D3E6"; c.font = `500 ${k ? 26 : 28}px ${SANS}`; c.fillText(rot, x + it + 44, stop + (k ? 46 : 52));
    caber(c, v, w - it - 44 - 16, 700, k ? 44 : 50, SANS); c.fillStyle = TXT; c.fillText(v, x + it + 42, stop + (k ? 98 : 112));
    x += w + gap;
  });
  y = stop - (k ? 36 : 44);
  caber(c, titulo, W - 2 * M, 700, k ? 76 : 92, TIT);
  c.fillStyle = TXT; c.fillText(titulo, M + 6, y);
  y -= k ? 92 : 112;
  c.font = `500 ${k ? 32 : 36}px ${SANS}`; c.fillStyle = "#C9D3E6";
  const dt = `${ser.length} séries`, dw = c.measureText(dt).width;
  c.fillText(dt, M + 8, y);
  c.fillStyle = CIANO; c.beginPath(); c.arc(M + 8 + dw + 26, y - 12, 6, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#C9D3E6"; c.fillText(`${nEx} exercício${nEx === 1 ? "" : "s"}`, M + 8 + dw + 52, y);
  const selo = (sx, sy) => {
    const st = `🔥 ${extras.semana}º treino da semana`; c.font = `700 ${k ? 28 : 30}px ${SANS}`;
    const sw = c.measureText(st).width + 44, hh = k ? 54 : 58;
    if (sx === null) sx = W - M - sw;
    c.fillStyle = k ? "rgba(8,14,4,.82)" : "rgba(132,204,22,.18)"; roundRect(c, sx, sy, sw, hh, hh / 2); c.fill();
    c.strokeStyle = "rgba(170,248,7,.6)"; c.lineWidth = 2; roundRect(c, sx, sy, sw, hh, hh / 2); c.stroke();
    c.fillStyle = TXT; c.textBaseline = "middle"; c.fillText(st, sx + 22, sy + hh / 2 + 1); c.textBaseline = "alphabetic";
  };
  // no story o selo fica na linha das séries; no post vai por cima da foto (sobra mais espaço)
  if (extras.semana && !k) selo(null, y - 44);

  // faixa de luz entre a foto e os dados
  const yLuz = y - (k ? 70 : 90);
  const luz = c.createLinearGradient(0, 0, W, 0);
  luz.addColorStop(0, "rgba(132,204,22,0)"); luz.addColorStop(0.5, "rgba(132,204,22,.18)"); luz.addColorStop(1, "rgba(170,248,7,.7)");
  c.strokeStyle = luz; c.lineWidth = 2; c.beginPath(); c.moveTo(0, yLuz + 30); c.quadraticCurveTo(W * 0.6, yLuz + 10, W, yLuz - 40); c.stroke();

  // área da foto
  const fx = M, fy = k ? 156 : 170, fw = W - 2 * M, fh = yLuz - (k ? 20 : 30) - fy;
  if (formato === "numeros") {
    // sem foto: halter grande e discreto no espaço livre
    if (fh > 160) { const t = Math.min(fh * 0.9, 260); c.globalAlpha = 0.18; icone(c, "halter", W / 2 - t / 2, fy + (fh - t) / 2, t, CIANO, 1.2); c.globalAlpha = 1; }
    if (extras.semana && k) selo(fx, fy);
    return;
  }
  if (fh < 200) { if (extras.semana && k) selo(null, fy); return; }
  if (img) {
    c.save(); roundRect(c, fx, fy, fw, fh, 36); c.clip();
    const esc = Math.max(fw / img.width, fh / img.height), w = img.width * esc, hh = img.height * esc;
    c.drawImage(img, fx + (fw - w) / 2, fy + (fh - hh) / 2, w, hh);
    c.restore();
    c.strokeStyle = "rgba(170,248,7,.35)"; c.lineWidth = 2; roundRect(c, fx, fy, fw, fh, 36); c.stroke();
  } else {
    c.fillStyle = "rgba(20,32,12,.35)"; roundRect(c, fx, fy, fw, fh, 36); c.fill();
    c.save(); if (previa) c.setLineDash([10, 9]); c.strokeStyle = "rgba(148,163,184,.55)"; c.lineWidth = 2.5; roundRect(c, fx, fy, fw, fh, 36); c.stroke(); c.restore();
    const cy = fy + fh / 2;
    c.textAlign = "center";
    if (fh < 380) {   // pouco espaço: só um texto
      c.fillStyle = TXT; c.font = `700 52px ${TIT}`; c.fillText(previa ? "Toque para adicionar foto" : "Treino concluído", W / 2, cy + 18);
    } else if (previa) {
      icone(c, "camera", W / 2 - 60, cy - 160, 120, "#DCE6F5", 1.4);
      c.fillStyle = CIANO; c.beginPath(); c.arc(W / 2, cy - 160 + 65, 18, 0, Math.PI * 2); c.lineWidth = 6; c.strokeStyle = CIANO; c.stroke();
      c.fillStyle = TXT; c.font = `700 58px ${TIT}`; c.fillText("Sua foto do treino", W / 2, cy + 32);
      c.fillStyle = MUDO; c.font = `500 36px ${SANS}`; c.fillText("Toque para adicionar", W / 2, cy + 92);
    } else {
      icone(c, "halter", W / 2 - 80, cy - 140, 160, "rgba(34,211,238,.55)", 1.4);
      c.fillStyle = TXT; c.font = `700 58px ${TIT}`; c.fillText("Treino concluído", W / 2, cy + 80);
    }
    c.textAlign = "left";
  }
  if (extras.semana && k) selo(fx + 22, fy + 22);
}
export function definirImagem(b) { ultimaImagem = b; }
export function roundRect(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

acoes.compartilhar = async () => {
  if (!ultimaImagem) return toast("A imagem ainda está sendo montada");
  const arq = new File([ultimaImagem], "meu-treino.jpg", { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    try { await navigator.share({ files: [arq], title: "Meu Treino" }); } catch { /* cancelado */ }
  } else acoes.salvarImg();
};
acoes.salvarImg = () => {
  if (!ultimaImagem) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(ultimaImagem); a.download = "meu-treino.jpg"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
