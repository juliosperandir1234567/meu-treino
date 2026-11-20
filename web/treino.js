// Treino em andamento, opções de equipamento, treino concluído e publicação.
import {
  sb, acoes, mudancas, limpeza, render, renderSemRolar, ir, h, toast, q, num, fmt, kg, hora, mmss, duracao,
  metaReps, ico, botaoVoltar, treinoAtivo, salvarTreinoAtivo, fotoUrl, fotoUrls, reduzir, enviarFoto, escolherFoto,
  carregarImagem, bip, destravarAudio, manterTelaLigada, comemorar, abrirFolha, fecharFolha, grafico,
} from "./util.js";
import { exImg, carregarMidia, preencherMidia } from "./midia.js";

let D = null; // dados do treino carregados

// ---------- iniciar ----------
export async function iniciarTreino(fichaId) {
  const ativo = treinoAtivo();
  if (ativo && !confirm("Já existe um treino em andamento. Começar outro mesmo assim?")) return ir("#/treino");
  const f = q(await sb.from("fichas").select("*").eq("id", fichaId).single());
  const nome = `Treino ${f.letra}${f.nome ? " · " + f.nome : ""}`;
  const s = q(await sb.from("sessoes").insert({ ficha_id: f.id, ficha_nome: nome, inicio: new Date().toISOString() }).select().single());
  destravarAudio();
  salvarTreinoAtivo({ sessaoId: s.id, fichaId: f.id, fichaNome: nome, idx: 0, opcoes: {}, ultimaSerie: null, descansoAte: null, descansoTotal: 0 });
  D = null;
  ir("#/treino");
}

async function carregar(t) {
  const s = q(await sb.from("sessoes").select("*").eq("id", t.sessaoId).single());
  const exs = q(await sb.from("exercicios").select("*").eq("ficha_id", t.fichaId).eq("ativo", true).order("ordem"));
  const ids = exs.map((e) => e.id);
  const eqs = ids.length ? q(await sb.from("equipamentos").select("*").in("exercicio_id", ids)) : [];
  const feitas = q(await sb.from("series_feitas").select("*").eq("sessao_id", t.sessaoId).order("feita_em"));
  const hist = ids.length ? q(await sb.from("series_feitas").select("*").in("exercicio_id", ids).neq("sessao_id", t.sessaoId).order("feita_em", { ascending: false }).limit(600)) : [];
  const urls = await fotoUrls(eqs.map((e) => e.foto_path));
  D = { sessaoId: t.sessaoId, s, exs, eqs, feitas, hist, urls, avisos: [], avisouAcima: {} };
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
  desenharTreino();
  let avisou10 = false, avisou0 = false, ultimoAte = null;
  const timer = setInterval(() => {
    const tt = treinoAtivo(); if (!tt) return;
    const el = document.getElementById("decorrido");
    if (el) el.textContent = mmss((Date.now() - new Date(D.s.inicio)) / 1000);
    if (tt.descansoAte !== ultimoAte) { ultimoAte = tt.descansoAte; avisou10 = false; avisou0 = false; }
    if (!tt.descansoAte) return;
    const resta = (new Date(tt.descansoAte) - Date.now()) / 1000;
    const c = document.getElementById("cron"), card = document.getElementById("cardDescanso"), rot = document.getElementById("rotDescanso");
    if (c) c.textContent = (resta < 0 ? "+" : "") + mmss(resta);
    if (card) card.classList.toggle("passou", resta < 0);
    if (card) card.classList.toggle("lar-borda", resta < 0);
    if (rot) rot.textContent = resta < 0 ? "Descanso passou do tempo" : "Descanso";
    const bar = document.getElementById("barDescanso");
    if (bar) { const tot = tt.descansoTotal || 90; bar.style.width = `${Math.max(0, Math.min(100, (resta / tot) * 100))}%`; bar.style.background = resta < 0 ? "var(--lar)" : "var(--ac)"; if (resta < 0) bar.style.width = "100%"; }
    if (resta <= 10 && resta > 0 && !avisou10) { avisou10 = true; bip(1); }
    if (resta <= 0 && !avisou0) { avisou0 = true; bip(3); }
  }, 1000);
  limpeza.fn = () => { clearInterval(timer); manterTelaLigada(false); };
}

function desenharTreino(rolar = false) {
  const t = treinoAtivo();
  const n = D.exs.length;
  t.idx = Math.min(Math.max(0, t.idx || 0), n - 1);
  const ex = D.exs[t.idx];
  const opcao = t.opcoes[ex.id] || 1;
  const eq = D.eqs.find((e) => e.exercicio_id === ex.id && e.opcao === opcao);
  const qtdOpc = D.eqs.filter((e) => e.exercicio_id === ex.id).length;
  const fotoEq = eq?.foto_path ? D.urls?.[eq.foto_path] : null;
  const feitas = D.feitas.filter((x) => x.exercicio_id === ex.id);
  const uv = ultimaVez(ex.id, opcao);
  const meta = metaReps(ex.reps);
  const ultimaHoje = feitas[feitas.length - 1];
  // carga sugerida: a última usada neste aparelho; se a ficha subiu a carga (opção 1), vale a da ficha
  let base = uv.carga ?? ex.carga_prevista;
  if (opcao === 1 && ex.carga_prevista != null && uv.carga != null && Number(ex.carga_prevista) > Number(uv.carga)) base = ex.carga_prevista;
  const cargaPadrao = ultimaHoje?.carga ?? base ?? "";
  const totalSeries = Math.max(ex.series, feitas.length);
  const exsFeitos = new Set(D.feitas.map((x) => x.exercicio_id));
  const pct = Math.round((D.exs.filter((e) => exsFeitos.has(e.id)).length / n) * 100);

  const linhas = [];
  for (let i = 1; i <= totalSeries; i++) {
    const f = feitas.find((x) => x.numero === i);
    const ant = uv.porNum[i];
    linhas.push(`<div class="serie ${f ? "feita" : ""}">
      <b style="text-align:center">${i}</b>
      <span class="peq mudo">${ant ? `${fmt(ant.carga)} × ${ant.reps ?? "—"}` : "—"}</span>
      <input id="kg-${i}" type="number" inputmode="decimal" step="0.5" aria-label="Carga série ${i}" value="${f ? f.carga ?? "" : cargaPadrao}" ${f ? "disabled" : ""}>
      <input id="rp-${i}" type="number" inputmode="numeric" aria-label="Repetições série ${i}" value="${f ? f.reps ?? "" : (ant?.reps ?? meta?.max ?? "")}" ${f ? "disabled" : ""}>
      <button class="ok" data-acao="feitoSerie" data-n="${i}" aria-label="${f ? "Desfazer série " + i : "Concluir série " + i}">${ico("check", 18, 'stroke-width="3"')}</button></div>`);
  }
  const descansos = feitas.filter((x) => x.descanso_seg).map((x) => {
    const extra = x.descanso_seg - ex.descanso_seg;
    return extra > 15 ? `<span class="lar">${mmss(x.descanso_seg)} (+${mmss(extra)})</span>` : mmss(x.descanso_seg);
  });

  const avisos = D.avisos.filter((a) => a.exId === ex.id).map((a) => a.tipo === "acima" ? `
    <div class="cartao ac-borda" role="status"><div class="linha" style="align-items:flex-start">
      <span class="ico" style="width:32px;height:32px;border:0;background:rgba(37,99,235,.12);color:var(--ac)">${ico("cima", 18)}</span>
      <div class="col" style="gap:2px"><b>Você aumentou a carga</b><span class="peq mudo">${kg(a.carga)} na série ${a.n}. ${a.refTxt}. Usar ${kg(a.carga)} daqui pra frente?</span></div></div>
      <div class="grade2"><button class="btn pri peq" data-acao="novaCarga" data-carga="${a.carga}">Sim, nova carga</button><button class="btn peq" data-acao="fecharAviso" data-id="${a.id}">Só hoje</button></div></div>` : `
    <div class="cartao lar-borda" role="status"><div class="linha" style="align-items:flex-start">
      <span class="ico" style="width:32px;height:32px;border:0;background:rgba(217,119,6,.12);color:var(--lar)">${ico(a.tipo === "menosCarga" ? "baixo" : "baixo", 18)}</span>
      <div class="col" style="gap:2px"><b>Abaixo do previsto</b><span class="peq mudo">${a.txt}</span></div>
      <button class="ico" style="width:32px;height:32px;margin-left:auto" data-acao="fecharAviso" data-id="${a.id}" aria-label="Fechar aviso">✕</button></div></div>`).join("");

  const resta = t.descansoAte ? (new Date(t.descansoAte) - Date.now()) / 1000 : null;
  const descanso = t.descansoAte ? `
    <div id="cardDescanso" class="cartao ${resta < 0 ? "passou lar-borda" : ""}">
      <div class="entre"><div class="col" style="gap:2px"><span id="rotDescanso" class="mini ${resta < 0 ? "lar" : "mudo"}">${resta < 0 ? "Descanso passou do tempo" : "Descanso"}</span>
        <span id="cron" class="cron">${(resta < 0 ? "+" : "") + mmss(resta)}</span></div>
        <div class="linha" style="gap:6px"><button class="btn peq" data-acao="ajusteDescanso" data-s="-15">−15s</button><button class="btn peq" data-acao="ajusteDescanso" data-s="15">+15s</button><button class="btn peq cla" data-acao="pularDescanso">Pular</button></div></div>
      <div class="barra"><div id="barDescanso" style="width:${resta < 0 ? 100 : Math.max(0, (resta / (t.descansoTotal || 90)) * 100)}%;${resta < 0 ? "background:var(--lar)" : ""}"></div></div></div>` : "";

  const porSessao = new Map();
  [...D.hist.filter((x) => x.exercicio_id === ex.id)].reverse().forEach((x) => {
    const c = Number(x.carga) || 0, v = porSessao.get(x.sessao_id);
    if (!v) porSessao.set(x.sessao_id, { c, d: x.feita_em }); else if (c > v.c) v.c = c;
  });
  const histPts = [...porSessao.values()].slice(-9);
  const maxHoje = Math.max(0, ...feitas.map((x) => Number(x.carga) || 0));
  if (maxHoje) histPts.push({ c: maxHoje, d: new Date().toISOString() });
  const historico = histPts.length >= 2 ? `<div class="cartao"><div class="entre"><b>Histórico de carga</b><span class="mini mudo">maior carga por treino</span></div>
    ${grafico(histPts.map((x) => x.c), histPts.map((x) => new Date(x.d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })))}
    <div class="entre mini mudo"><span>Primeira: <b style="color:var(--txt)">${kg(histPts[0].c)}</b></span><span>Melhor: <b class="ac">${kg(Math.max(...histPts.map((x) => x.c)))}</b></span></div></div>` : "";
  const html = `<section class="tela">
    <div class="topo">${botaoVoltar("#/hoje")}<div class="tit" style="align-items:center"><b class="num" style="font-size:17px">${h(t.fichaNome)}</b>
      <span class="peq mudo">Início ${hora(D.s.inicio)} · <span id="decorrido">${mmss((Date.now() - new Date(D.s.inicio)) / 1000)}</span> de treino</span></div><span style="width:44px"></span></div>
    <div class="col" style="gap:6px"><div class="entre mini mudo"><span>Exercício ${t.idx + 1} de ${n} · ${pct}% feito</span>
      <button class="btn peq" style="min-height:32px" data-acao="listaExs">${ico("lista", 15)} Ver todos</button></div><div class="barra"><div style="width:${pct}%"></div></div></div>
    <div class="exs">${D.exs.map((e, i) => `<button data-acao="irEx" data-i="${i}" class="${i === t.idx ? "at" : exsFeitos.has(e.id) ? "fe" : ""}" aria-label="${h(e.nome)}">${i + 1}</button>`).join("")}</div>
    ${avisos}
    <div class="cartao">
      <div class="ex-midia">
        ${verAparelho && fotoEq ? `<button class="ex-foto-ap" data-acao="verFoto" data-src="${h(fotoEq)}" data-tit="${h(eq?.nome || ex.nome)}" aria-label="Ampliar foto do aparelho"><img src="${h(fotoEq)}" alt="Foto do aparelho"></button>` : exImg(ex.nome, "grande")}
        ${fotoEq ? `<div class="ex-midia-abas"><button class="${verAparelho ? "" : "at"}" data-acao="midiaAba" data-v="0">Movimento</button><button class="${verAparelho ? "at" : ""}" data-acao="midiaAba" data-v="1">Meu aparelho</button></div>` : ""}
      </div>
      <div class="col" style="gap:4px;min-width:0"><h2>${h(ex.nome)}</h2>
        <span class="peq mudo">${ex.series} séries · ${h(ex.reps)} repetições${ex.carga_prevista ? " · ficha " + kg(ex.carga_prevista) : ""} · descanso ${mmss(ex.descanso_seg)}</span>
        ${ex.obs ? `<span class="peq ac">${h(ex.obs)}</span>` : ""}</div>
      <div class="grade2">
        <a href="#/equip/${ex.id}" class="btn peq">${ico("imagem", 16)} ${eq?.nome ? h(eq.nome.slice(0, 16)) : "Equipamento"}${qtdOpc > 1 ? ` · ${opcao}/${qtdOpc}` : ""}</a>
        <button class="btn peq" data-acao="comoFazer" data-nome="${h(ex.nome)}">${ico("play", 15)} Como fazer</button></div>
      <div class="series"><div class="serie cab"><span>Série</span><span>Anterior</span><span>Kg</span><span>Reps</span><span></span></div>${linhas.join("")}</div>
      <div class="entre"><button class="btn peq" data-acao="maisSerie">${ico("mais", 16)} Série extra</button>
        ${descansos.length ? `<span class="mini mudo" style="text-align:right">Descansos: ${descansos.join(" · ")}</span>` : ""}</div>
    </div>
    ${descanso}
    ${historico}
    ${t.idx + 1 < n ? `<div class="col" style="gap:8px"><span class="rot">A seguir</span><button class="cartao tracejado" style="text-align:left;color:inherit" data-acao="irEx" data-i="${t.idx + 1}">
      <div class="entre"><div class="col" style="gap:2px"><b>${h(D.exs[t.idx + 1].nome)}</b><span class="mini mudo">${D.exs[t.idx + 1].series} × ${h(D.exs[t.idx + 1].reps)}</span></div><span class="peq mudo">${t.idx + 2}/${n}</span></div></button></div>` : ""}
  </section>
  <div class="rodape"><div style="display:grid;grid-template-columns:1fr 2fr">
    <button class="btn" data-acao="finalizar">Finalizar</button>
    ${t.idx + 1 < n ? `<button class="btn pri" data-acao="irEx" data-i="${t.idx + 1}">Próximo exercício</button>` : `<button class="btn pri" data-acao="finalizar">Concluir treino</button>`}
  </div></div>`;
  rolar ? render(html) : renderSemRolar(html);
}

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
acoes.irEx = (el) => { const t = treinoAtivo(); t.idx = Number(el.dataset.i); salvarTreinoAtivo(t); desenharTreino(true); };
acoes.maisSerie = async () => {
  const t = treinoAtivo(); const ex = D.exs[t.idx];
  ex.series += 1; desenharTreino();
};
acoes.feitoSerie = async (el) => {
  destravarAudio();
  const t = treinoAtivo();
  const ex = D.exs[t.idx];
  const n = Number(el.dataset.n);
  const opcao = t.opcoes[ex.id] || 1;
  const ja = D.feitas.find((x) => x.exercicio_id === ex.id && x.numero === n);
  if (ja) { // desfazer
    q(await sb.from("series_feitas").delete().eq("id", ja.id));
    D.feitas = D.feitas.filter((x) => x.id !== ja.id);
    return desenharTreino();
  }
  const carga = num(document.getElementById(`kg-${n}`).value);
  const reps = num(document.getElementById(`rp-${n}`).value);
  const agora = new Date();
  const descanso = t.ultimaSerie ? Math.round((agora - new Date(t.ultimaSerie)) / 1000) : null;
  const linha = q(await sb.from("series_feitas").insert({
    sessao_id: t.sessaoId, exercicio_id: ex.id, exercicio_nome: ex.nome, equipamento_opcao: opcao, numero: n,
    carga, reps: reps === null ? null : Math.round(reps), descanso_seg: descanso && descanso < 1800 ? descanso : null, feita_em: agora.toISOString(),
  }).select().single());
  D.feitas.push(linha);
  t.ultimaSerie = agora.toISOString();
  const feitasEx = D.feitas.filter((x) => x.exercicio_id === ex.id).length;
  if (feitasEx < ex.series || t.idx + 1 < D.exs.length) {
    t.descansoAte = new Date(agora.getTime() + ex.descanso_seg * 1000).toISOString();
    t.descansoTotal = ex.descanso_seg;
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
};
acoes.fecharAviso = (el) => { D.avisos = D.avisos.filter((a) => a.id !== el.dataset.id); desenharTreino(); };
acoes.novaCarga = async (el) => {
  const t = treinoAtivo(); const ex = D.exs[t.idx]; const carga = num(el.dataset.carga);
  q(await sb.from("exercicios").update({ carga_prevista: carga }).eq("id", ex.id));
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
acoes.finalizar = async () => {
  const t = treinoAtivo();
  if (!D.feitas.length) {
    if (!confirm("Nenhuma série marcada. Descartar este treino?")) return;
    q(await sb.from("sessoes").delete().eq("id", t.sessaoId));
    salvarTreinoAtivo(null); D = null; return ir("#/hoje");
  }
  const previstas = D.exs.reduce((s, e) => s + e.series, 0);
  if (D.feitas.length < previstas && !confirm(`Você fez ${D.feitas.length} de ${previstas} séries. Finalizar mesmo assim?`)) return;
  q(await sb.from("sessoes").update({ fim: new Date().toISOString() }).eq("id", t.sessaoId));
  salvarTreinoAtivo(null); D = null;
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
export const volumeTxt = (v) => (v >= 1000 ? `${fmt(v / 1000)} t` : `${fmt(v, 0)} kg`);

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
  if (!jaFesta) {
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
  render(`<section class="tela">
    <div class="topo">${botaoVoltar(`#/fim/${id}`)}<div class="tit"><h2>Publicar treino</h2></div></div>
    <canvas id="cv" class="prev" aria-label="Prévia da imagem para publicar"></canvas>
    <div class="abas">${[["story", "Story"], ["post", "Post"], ["numeros", "Só números"]].map(([k, t]) => `<button class="${formato === k ? "at" : ""}" data-acao="formato" data-f="${k}" data-id="${id}">${t}</button>`).join("")}</div>
    ${!foto && formato !== "numeros" ? `<a class="btn" href="#/fim/${id}">${ico("camera", 18)} Adicionar foto do treino</a>` : ""}
  </section>
  <div class="rodape"><div><button class="btn" data-acao="salvarImg">Salvar imagem</button><button class="btn pri" data-acao="compartilhar">${ico("share", 18)} Compartilhar</button></div></div>`);
  await desenharCard(r, foto);
}
acoes.formato = (el) => { formato = el.dataset.f; telaPublicar(el.dataset.id); };

async function desenharCard({ s, ser, volume, recordes }, foto) {
  const cv = document.getElementById("cv"); if (!cv) return;
  const W = 1080, H = formato === "story" ? 1920 : formato === "post" ? 1350 : 1080;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  try { await document.fonts.ready; } catch { /* */ }
  c.fillStyle = "#111A2E"; c.fillRect(0, 0, W, H);
  if (foto && formato !== "numeros") {
    try {
      const img = await carregarImagem(foto);
      const esc = Math.max(W / img.width, H / img.height);
      const w = img.width * esc, hh = img.height * esc;
      c.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh);
    } catch { /* foto indisponível */ }
    const g = c.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, "rgba(11,18,32,0)"); g.addColorStop(0.5, "rgba(11,18,32,.85)"); g.addColorStop(1, "rgba(11,18,32,.95)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const g2 = c.createLinearGradient(0, 0, 0, 260); g2.addColorStop(0, "rgba(11,18,32,.6)"); g2.addColorStop(1, "rgba(11,18,32,0)");
    c.fillStyle = g2; c.fillRect(0, 0, W, 260);
  } else {
    c.fillStyle = "#0B1220"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "#3B82F6"; c.lineWidth = 6; c.globalAlpha = .15;
    for (let i = -H; i < W; i += 90) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); }
    c.globalAlpha = 1;
  }
  const M = 72;
  c.fillStyle = "#F2F3F5"; c.font = "700 46px 'Space Grotesk', sans-serif"; c.textBaseline = "top";
  c.fillText("Meu Treino", M, M);
  const letra = (s.ficha_nome.match(/Treino\s+(\S+)/) || [])[1] || "";
  if (letra) {
    c.font = "700 36px Inter, sans-serif";
    const txt = `Treino ${letra}`, tw = c.measureText(txt).width + 48;
    c.fillStyle = "#3B82F6"; roundRect(c, W - M - tw, M - 6, tw, 64, 32); c.fill();
    c.fillStyle = "#FFFFFF"; c.fillText(txt, W - M - tw + 24, M + 8);
  }
  const titulo = s.ficha_nome.replace(/^Treino\s+\S+\s*·?\s*/, "") || s.ficha_nome;
  const base = H - M;
  let y = base - (recordes.length ? 70 : 0);
  if (recordes.length) {
    c.fillStyle = "#3B82F6"; c.font = "600 38px Inter, sans-serif"; c.textBaseline = "bottom";
    const r = recordes[0];
    c.fillText(`Recorde: ${r.nome} ${fmt(r.carga)} kg${r.reps ? " × " + r.reps : ""}`.slice(0, 48), M, base);
  }
  const cols = [["Duração", s.fim ? duracao(s.inicio, s.fim) : "—"], ["Volume", volumeTxt(volume)], ["Horário", `${hora(s.inicio)}–${hora(s.fim)}`]];
  const cw = (W - 2 * M) / 3;
  cols.forEach(([rot, v], i) => {
    c.textBaseline = "bottom";
    c.fillStyle = "#F2F3F5"; c.font = "700 54px Inter, sans-serif"; c.fillText(v, M + i * cw, y - 10);
    c.fillStyle = "#B8BDC4"; c.font = "500 30px Inter, sans-serif"; c.fillText(rot, M + i * cw, y - 76);
  });
  c.fillStyle = "#F2F3F5"; c.font = "700 84px 'Space Grotesk', sans-serif";
  c.fillText(titulo.slice(0, 22), M, y - 140);
  c.fillStyle = "#B8BDC4"; c.font = "500 34px Inter, sans-serif";
  c.fillText(`${new Date(s.inicio).toLocaleDateString("pt-BR")} · ${ser.length} séries`, M, y - 240);
  ultimaImagem = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92));
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
