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
    <div class="topo">${botaoVoltar("#/hoje")}<div class="tit"><span class="rot ac">Treino concluído</span></div></div>
    <div class="col" style="gap:6px"><h1>${h(s.ficha_nome || "Treino")}</h1>
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
// Modelo de compartilhamento: fundo preto, símbolo do logo no topo, foto grande com borda verde-limão
// (a pessoa escolhe, arrasta e dá zoom), "TREINO CONCLUÍDO", nome do treino, duração · séries · exercícios e data.
let formato = "story";
let ultimaImagem = null;
const ajuste = {};          // posição/zoom da foto por treino: { z, dx, dy } (dx/dy em fração da área da foto)
let pub = null;             // o que está na tela: { id, r, img }
let layoutAtual = null;     // área da foto no último desenho (para arrastar e limitar)
const LIMA = "#B5FF00", BRANCO = "#FFFFFF", CINZA = "#C9CCC4";
const ESPORTE = "'Barlow Condensed', 'Arial Narrow', sans-serif", SANS = "Inter, sans-serif";
let simbolo = null;
const carregarSimbolo = () => simbolo || (simbolo = carregarImagem("logo.png").catch(() => null));

export async function telaPublicar(id) {
  if (formato !== "story" && formato !== "post") formato = "story";
  const r = await resumoSessao(id);
  const foto = r.s.foto_path ? await fotoUrl(r.s.foto_path) : null;
  let img = null;
  if (foto) { try { img = await carregarImagem(foto); } catch { /* foto indisponível */ } }
  pub = { id, r, img };
  const aj = ajuste[id] || (ajuste[id] = { z: 1, dx: 0, dy: 0 });
  render(`<section class="tela">
    <div class="topo">${botaoVoltar(`#/fim/${id}`)}<div class="tit"><h2>Compartilhar treino</h2></div></div>
    <div class="abas">${[["story", "Story"], ["post", "Post"]].map(([k, t]) => `<button class="${formato === k ? "at" : ""}" data-acao="formato" data-f="${k}" data-id="${id}">${t}</button>`).join("")}</div>
    <canvas id="cv" class="prev pub-prev" aria-label="Prévia da imagem. ${img ? "Arraste para posicionar a foto" : "Toque para escolher a foto"}"></canvas>
    <div class="pub-ctl">
      <button class="btn" data-acao="fotoPublicar" data-id="${id}">${ico("camera", 18)} ${img ? "Trocar foto" : "Escolher foto"}</button>
      ${img ? `<label class="pub-zoom"><span>Zoom</span><input id="zoomFoto" type="range" min="1" max="3" step="0.01" value="${aj.z}" aria-label="Zoom da foto"></label>
        <span class="mini mudo" style="text-align:center">Arraste a foto na prévia para posicionar · <button class="link" data-acao="resetFoto">centralizar</button></span>` : ""}
    </div>
  </section>
  <div class="rodape"><div><button class="btn" data-acao="salvarImg">Salvar imagem</button><button class="btn pri" data-acao="compartilhar">${ico("share", 18)} Compartilhar</button></div></div>`);
  try { await document.fonts.load(`italic 800 100px ${ESPORTE}`); await document.fonts.ready; } catch { /* usa a fonte reserva */ }
  await carregarSimbolo();
  redesenhar();
  ligarAjusteFoto();
}
acoes.formato = (el) => { formato = el.dataset.f; telaPublicar(el.dataset.id); };
acoes.fotoPublicar = async (el) => {
  const file = await escolherFoto();
  if (!file) return;
  toast("Enviando foto…");
  const path = await enviarFoto(await reduzir(file, 1800, 0.88), "treinos");
  q(await sb.from("sessoes").update({ foto_path: path }).eq("id", el.dataset.id));
  ajuste[el.dataset.id] = { z: 1, dx: 0, dy: 0 };
  toast("Foto salva"); telaPublicar(el.dataset.id);
};
acoes.resetFoto = () => { if (!pub) return; ajuste[pub.id] = { z: 1, dx: 0, dy: 0 }; const z = document.getElementById("zoomFoto"); if (z) z.value = 1; redesenhar(); };

// arrastar a foto na prévia e zoom pelo controle (ou pinça com dois dedos)
function ligarAjusteFoto() {
  const cv = document.getElementById("cv"); if (!cv || !pub) return;
  if (!pub.img) { cv.onclick = () => document.querySelector('[data-acao="fotoPublicar"]')?.click(); return; }
  const aj = ajuste[pub.id];
  const z = document.getElementById("zoomFoto");
  if (z) z.oninput = () => { aj.z = Number(z.value); limitar(aj); redesenhar(); };
  const toques = new Map(); let dist0 = 0, z0 = 1;
  cv.style.touchAction = "none";
  cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) { const [a, b] = [...toques.values()]; dist0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = aj.z; } };
  cv.onpointermove = (e) => {
    const ant = toques.get(e.pointerId); if (!ant) return;
    const L = layoutAtual, esc = cv.width / cv.clientWidth; if (!L) return;
    if (toques.size === 1) { aj.dx += ((e.clientX - ant.x) * esc) / L.fw; aj.dy += ((e.clientY - ant.y) * esc) / L.fh; }
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) { const [a, b] = [...toques.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (dist0) aj.z = Math.min(3, Math.max(1, z0 * d / dist0)); if (z) z.value = aj.z; }
    limitar(aj); redesenhar();
  };
  const fim = (e) => { toques.delete(e.pointerId); if (toques.size < 2) dist0 = 0; guardarImagem(); };
  cv.onpointerup = fim; cv.onpointercancel = fim;
  if (z) z.onchange = guardarImagem;
}
// a foto nunca deixa buraco na área: o deslocamento fica dentro da sobra da imagem
function limitar(aj) {
  const cv = document.getElementById("cv"); if (!cv || !pub?.img) return;
  const L = layoutAtual, img = pub.img; if (!L) return;
  const esc = Math.max(L.fw / img.width, L.fh / img.height) * aj.z;
  const sx = Math.max(0, (img.width * esc - L.fw) / 2) / L.fw, sy = Math.max(0, (img.height * esc - L.fh) / 2) / L.fh;
  aj.dx = Math.min(sx, Math.max(-sx, aj.dx)); aj.dy = Math.min(sy, Math.max(-sy, aj.dy));
}

// posições de tudo, de baixo para cima, conforme o formato (sem esticar nada)
function layout(W, H) {
  const story = H > 1500, k = story ? 1 : 0.86, M = 48;
  return { story, k, M, topoLogo: story ? 46 : 34, alturaLogo: story ? 104 : 80, fx: M, fy: story ? 186 : 140, fw: W - 2 * M, fh: 0 };
}
function quebrarLinhas(c, txt, max, linhasMax, tam0, min) {
  for (let t = tam0; t >= min; t -= 4) {
    c.font = `italic 800 ${t}px ${ESPORTE}`;
    const palavras = txt.split(/\s+/); const linhas = []; let l = "";
    for (const p of palavras) { const tenta = l ? l + " " + p : p; if (c.measureText(tenta).width <= max) l = tenta; else { if (l) linhas.push(l); l = p; } }
    if (l) linhas.push(l);
    if (linhas.length <= linhasMax && linhas.every((x) => c.measureText(x).width <= max)) return { linhas, t };
  }
  c.font = `italic 800 ${min}px ${ESPORTE}`;
  return { linhas: [txt], t: min };
}
function pintarPublicacao(c, W, H, { s, ser, recordes }, img, aj, previa) {
  const L = layout(W, H), { k, M, story } = L;
  c.textBaseline = "alphabetic"; c.textAlign = "left";
  // fundo preto com linhas finas verdes nos cantos
  c.fillStyle = "#050505"; c.fillRect(0, 0, W, H);
  c.strokeStyle = "rgba(181,255,0,.35)"; c.lineWidth = 2;
  const diag = (x1, y1, x2, y2, a) => { c.globalAlpha = a; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.globalAlpha = 1; };
  diag(W - 230, 0, W, 300, .5); diag(W - 170, 0, W, 210, .35);
  diag(0, 260, 200, 0, .3);
  diag(W, H - 380, W - 260, H, .4); diag(W, H - 300, W - 200, H, .25);

  // ----- de baixo para cima -----
  const base = H - (story ? 60 : 44);
  // data à direita
  c.fillStyle = BRANCO; c.font = `700 ${Math.round(40 * k)}px ${SANS}`; c.textAlign = "right";
  c.fillText(new Date(s.inicio).toLocaleDateString("pt-BR"), W - M, base); c.textAlign = "left";
  // linha verde
  const yLinha = base - Math.round(62 * k);
  c.fillStyle = LIMA; c.fillRect(M, yLinha, W - 2 * M, 3);
  let y = yLinha - Math.round(40 * k);
  // recordes (só quando tem): uma linha discreta acima da linha verde
  if (recordes.length) {
    const txt = recordes.slice(0, 2).map((r) => `${r.nome} ${fmt(r.carga)} kg${r.reps ? " × " + r.reps : ""}`).join("  ·  ");
    c.font = `italic 700 ${Math.round(30 * k)}px ${SANS}`; c.fillStyle = LIMA;
    let t = `🏆 ${recordes.length > 1 ? recordes.length + " RECORDES: " : "RECORDE: "}${txt}`;
    while (c.measureText(t).width > W - 2 * M && t.length > 20) t = t.slice(0, -2);
    c.fillText(t, M, y + 4);
    y -= Math.round(62 * k);
  }
  // três indicadores
  const nEx = new Set(ser.map((x) => x.exercicio_id || x.exercicio_nome)).size;
  const dur = s.fim ? duracao(s.inicio, s.fim).replace(" min", "min") : "—";
  const ind = [[dur, "DURAÇÃO"], [String(ser.length), "SÉRIES"], [String(nEx), "EXERCÍCIOS"]];
  const colW = (W - 2 * M) / 3, hInd = Math.round(150 * k), topoInd = y - hInd;
  ind.forEach(([v, rot], i) => {
    const cx = M + colW * i + colW / 2;
    c.textAlign = "center"; c.fillStyle = BRANCO;
    let tam = Math.round(116 * k); c.font = `italic 800 ${tam}px ${ESPORTE}`;
    while (c.measureText(v).width > colW - 30 && tam > 50) { tam -= 4; c.font = `italic 800 ${tam}px ${ESPORTE}`; }
    c.fillText(v, cx, topoInd + Math.round(96 * k));
    c.fillStyle = CINZA; c.font = `italic 500 ${Math.round(30 * k)}px ${SANS}`;
    if ("letterSpacing" in c) c.letterSpacing = "4px";
    c.fillText(rot, cx + 2, topoInd + Math.round(140 * k));
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    if (i) { c.fillStyle = LIMA; c.fillRect(M + colW * i - 1, topoInd + 8, 3, hInd - 10); }
  });
  c.textAlign = "left";
  y = topoInd - Math.round(44 * k);
  // nome do treino (até 2 linhas, diminui se for longo)
  const nome = (gruposTreinados(ser) || (s.ficha_nome || "Treino").replace(/^Treino\s+\S+\s*·?\s*/, "") || "Treino").toUpperCase();
  const { linhas, t } = quebrarLinhas(c, nome, W - 2 * M, 2, Math.round(118 * k), Math.round(64 * k));
  c.fillStyle = BRANCO; c.font = `italic 800 ${t}px ${ESPORTE}`;
  const alt = Math.round(t * 0.98);
  linhas.slice().reverse().forEach((ln, i) => c.fillText(ln, M, y - i * alt));
  y -= (linhas.length - 1) * alt + t * 0.82 + Math.round(26 * k);
  // "TREINO CONCLUÍDO" com halter
  const hal = Math.round(34 * k);
  halterPequeno(c, M, y - hal + 4, hal * 1.9, hal);
  c.fillStyle = LIMA; c.font = `italic 800 ${Math.round(34 * k)}px ${SANS}`;
  if ("letterSpacing" in c) c.letterSpacing = "6px";
  c.fillText("TREINO CONCLUÍDO", M + hal * 1.9 + 22, y);
  if ("letterSpacing" in c) c.letterSpacing = "0px";
  const fundoFoto = y - Math.round(46 * k);

  // ----- topo: símbolo do logo -----
  if (simbolo) { const hL = L.alturaLogo, wL = simbolo.width * hL / simbolo.height; c.drawImage(simbolo, (W - wL) / 2, L.topoLogo, wL, hL); }

  // ----- foto -----
  const fx = L.fx, fy = L.fy, fw = L.fw, fh = Math.max(200, fundoFoto - fy), r = 34;
  c.fillStyle = "#141414"; roundRect(c, fx, fy, fw, fh, r); c.fill();
  if (img) {
    c.save(); roundRect(c, fx, fy, fw, fh, r); c.clip();
    const esc = Math.max(fw / img.width, fh / img.height) * (aj?.z || 1);
    const w = img.width * esc, hh = img.height * esc;
    c.drawImage(img, fx + (fw - w) / 2 + (aj?.dx || 0) * fw, fy + (fh - hh) / 2 + (aj?.dy || 0) * fh, w, hh);
    c.restore();
  } else if (previa) {
    // só na prévia (não vai para a imagem salva)
    c.textAlign = "center"; c.fillStyle = "rgba(255,255,255,.55)"; c.font = `600 ${Math.round(40 * k)}px ${SANS}`;
    c.fillText("Toque para escolher a foto", W / 2, fy + fh / 2); c.textAlign = "left";
  }
  c.strokeStyle = LIMA; c.lineWidth = 4; roundRect(c, fx + 2, fy + 2, fw - 4, fh - 4, r - 2); c.stroke();
  return { fx, fy, fw, fh };
}
function halterPequeno(c, x, y, w, h) {
  c.fillStyle = LIMA;
  const u = w / 19;
  const ret = (xx, yy, ww, hh) => { roundRect(c, x + xx * u, y + yy, ww * u, hh, Math.min(ww * u, hh) / 3); c.fill(); };
  ret(0, h * 0.3, 2, h * 0.4); ret(3, h * 0.1, 2.2, h * 0.8); ret(13.8, h * 0.1, 2.2, h * 0.8); ret(17, h * 0.3, 2, h * 0.4);
  c.fillRect(x + 5.2 * u, y + h * 0.44, 8.6 * u, h * 0.12);
}
// grupos trabalhados nas séries feitas, do mais para o menos. Ex.: "Peito, Ombro e Braço"
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
// desenha a prévia (com "toque para escolher" se faltar foto) e guarda a imagem limpa para salvar/compartilhar
function redesenhar() {
  const cv = document.getElementById("cv"); if (!cv || !pub) return;
  const W = 1080, H = formato === "story" ? 1920 : 1350;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  layoutAtual = pintarPublicacao(cv.getContext("2d"), W, H, pub.r, pub.img, ajuste[pub.id], true);
  clearTimeout(redesenhar.t); redesenhar.t = setTimeout(guardarImagem, 250);
}
function guardarImagem() {
  if (!pub) return;
  const W = 1080, H = formato === "story" ? 1920 : 1350;
  const off = document.createElement("canvas"); off.width = W; off.height = H;
  pintarPublicacao(off.getContext("2d"), W, H, pub.r, pub.img, ajuste[pub.id], false);
  off.toBlob((b) => { if (b) ultimaImagem = b; }, "image/png");
}

export function definirImagem(b) { ultimaImagem = b; }
export function roundRect(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

acoes.compartilhar = async () => {
  if (!ultimaImagem) return toast("A imagem ainda está sendo montada");
  const png = ultimaImagem.type === "image/png";
  const arq = new File([ultimaImagem], png ? "meu-treino.png" : "meu-treino.jpg", { type: ultimaImagem.type || "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    try { await navigator.share({ files: [arq], title: "Meu Treino" }); } catch { /* cancelado */ }
  } else acoes.salvarImg();
};
acoes.salvarImg = () => {
  if (!ultimaImagem) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(ultimaImagem); a.download = ultimaImagem.type === "image/png" ? "meu-treino.png" : "meu-treino.jpg"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
