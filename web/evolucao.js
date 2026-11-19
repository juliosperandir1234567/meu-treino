// Evolução (medidas, cargas, peso), avaliação física e resumo da semana.
import {
  sb, acoes, render, ir, h, toast, q, fmt, kg, dataCurta, inicioSemana, ico, botaoVoltar, nav, grafico,
  normal, metaReps, grupoDe, METAS,
} from "./util.js";
import { formAvaliacao, lerFormAvaliacao } from "./print.js";
import { volumeTxt } from "./treino.js";

const achar = (med, ...chaves) => {
  const ks = Object.keys(med || {});
  for (const c of chaves) { const k = ks.find((x) => normal(x).includes(c)); if (k) return k; }
  return null;
};
function valorBraco(med) {
  const ks = Object.keys(med || {}).filter((k) => normal(k).includes("braco"));
  if (!ks.length) return null;
  const v = ks.map((k) => Number(med[k])).filter((x) => !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function delta(atual, antes, bomSubir = true, un = "") {
  if (atual == null || antes == null) return `<span class="mini mudo">—</span>`;
  const d = Number(atual) - Number(antes);
  if (Math.abs(d) < 0.05) return `<span class="mini mudo">igual</span>`;
  const bom = bomSubir ? d > 0 : d < 0;
  return `<span class="mini ${bom ? "ac" : "lar"}" style="font-weight:600">${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}${un}</span>`;
}

// ---------- EVOLUÇÃO ----------
let medidaSel = null;
export async function telaEvolucao(aba, exNome) {
  const avs = q(await sb.from("avaliacoes").select("*").order("data"));
  let corpo = "";
  if (aba === "medidas") {
    const ult = avs[avs.length - 1], ant = avs[avs.length - 2];
    const ombro = (a) => a ? a.medidas[achar(a.medidas, "ombro")] ?? null : null;
    const cint = (a) => a ? a.medidas[achar(a.medidas, "cintura", "abdomen")] ?? null : null;
    const chaves = [...new Set(avs.flatMap((a) => Object.keys(a.medidas || {})))];
    if (!medidaSel || !chaves.includes(medidaSel)) medidaSel = achar(Object.fromEntries(chaves.map((k) => [k, 1])), "braco direito", "braco") || chaves[0];
    corpo = !avs.length ? vazioAv() : `
      <div class="grade3">
        <div class="stat"><span class="mini mudo">Braço</span><span class="v">${fmt(valorBraco(ult?.medidas))}</span>${delta(valorBraco(ult?.medidas), valorBraco(ant?.medidas), true, " cm")}</div>
        <div class="stat"><span class="mini mudo">Ombro</span><span class="v">${fmt(ombro(ult))}</span>${delta(ombro(ult), ombro(ant), true, " cm")}</div>
        <div class="stat"><span class="mini mudo">Cintura</span><span class="v">${fmt(cint(ult))}</span>${delta(cint(ult), cint(ant), false, " cm")}</div></div>
      ${chaves.length ? `<div class="cartao"><div class="entre"><b>${h(medidaSel)} (cm)</b>
        <select class="inp" style="width:auto;min-height:36px;font-size:13px" onchange="window.__medida(this.value)" aria-label="Escolher medida">${chaves.map((k) => `<option ${k === medidaSel ? "selected" : ""}>${h(k)}</option>`).join("")}</select></div>
        ${grafico(avs.map((a) => a.medidas[medidaSel] ?? null), avs.map((a) => dataCurta(a.data + "T12:00")))}</div>` : ""}`;
  } else if (aba === "peso") {
    const comPeso = avs.filter((a) => a.peso != null);
    const ult = comPeso[comPeso.length - 1], ant = comPeso[comPeso.length - 2];
    corpo = !comPeso.length ? vazioAv() : `
      <div class="grade2"><div class="stat"><span class="mini mudo">Peso</span><span class="v">${kg(ult.peso)}</span>${delta(ult.peso, ant?.peso, false, " kg")}</div>
        <div class="stat"><span class="mini mudo">Gordura</span><span class="v">${ult.gordura != null ? fmt(ult.gordura) + " %" : "—"}</span>${delta(ult.gordura, ant?.gordura, false, " pts")}</div></div>
      <div class="cartao"><b>Peso (kg)</b>${grafico(comPeso.map((a) => Number(a.peso)), comPeso.map((a) => dataCurta(a.data + "T12:00")))}</div>`;
  } else {
    const desde = new Date(Date.now() - 120 * 864e5).toISOString();
    const ser = q(await sb.from("series_feitas").select("exercicio_nome, carga, reps, sessao_id, feita_em").gte("feita_em", desde).order("feita_em"));
    const porEx = {};
    ser.forEach((x) => { if (x.carga == null) return; (porEx[x.exercicio_nome] ||= []).push(x); });
    if (exNome && porEx[exNome]) {
      const sess = []; const vistos = {};
      porEx[exNome].forEach((x) => { if (!vistos[x.sessao_id]) { vistos[x.sessao_id] = { d: x.feita_em, max: 0 }; sess.push(vistos[x.sessao_id]); } vistos[x.sessao_id].max = Math.max(vistos[x.sessao_id].max, Number(x.carga)); });
      corpo = `<a class="btn peq" href="#/evolucao?aba=cargas" style="align-self:flex-start">${ico("voltar", 16)} Todos os exercícios</a>
        <div class="cartao"><b>${h(exNome)} · maior carga por treino</b>${grafico(sess.map((s) => s.max), sess.map((s) => dataCurta(s.d)))}
        <span class="peq mudo">Melhor: <b class="ac">${kg(Math.max(...sess.map((s) => s.max)))}</b> · ${sess.length} treinos</span></div>`;
    } else {
      const linhas = Object.entries(porEx).map(([nome, xs]) => {
        const max = Math.max(...xs.map((x) => Number(x.carga)));
        const prim = Number(xs[0].carga);
        return { nome, max, ganho: max - prim, ult: xs[xs.length - 1].feita_em };
      }).sort((a, b) => new Date(b.ult) - new Date(a.ult));
      corpo = linhas.length ? `<div class="col">${linhas.map((l) => `<a class="item" href="#/evolucao?aba=cargas&ex=${encodeURIComponent(l.nome)}">
        <span class="col" style="flex:1;gap:2px"><b>${h(l.nome)}</b><span class="mini mudo">último: ${dataCurta(l.ult)}</span></span>
        <b>${kg(l.max)}</b>${l.ganho > 0 ? `<span class="mini ac" style="font-weight:600">+${fmt(l.ganho)}</span>` : ""}<span class="mudo">${ico("seta", 16)}</span></a>`).join("")}</div>`
        : `<div class="vazio">As cargas aparecem aqui depois do primeiro treino.</div>`;
    }
  }
  render(`<section class="tela">
    <div class="col" style="gap:4px"><h1>Evolução</h1><span class="peq mudo">Braço e ombro subindo, cintura descendo</span></div>
    <div class="abas">${[["medidas", "Medidas"], ["cargas", "Cargas"], ["peso", "Peso"]].map(([k, t]) => `<button class="${aba === k ? "at" : ""}" data-acao="abaEvo" data-a="${k}">${t}</button>`).join("")}</div>
    ${corpo}
    <a class="btn" href="#/avaliacao">${ico("pessoa", 18)} Avaliação física completa</a>
  </section>${nav("#/evolucao")}`);
}
window.__medida = (v) => { medidaSel = v; telaEvolucao("medidas"); };
acoes.abaEvo = (el) => ir(`#/evolucao?aba=${el.dataset.a}`);
const vazioAv = () => `<div class="cartao vazio"><p style="margin:0">Nenhuma avaliação ainda.</p>
  <a class="btn pri blk" href="#/print?tipo=avaliacao">${ico("camera", 18)} Mandar print da avaliação</a><a class="btn blk" href="#/medir">Lançar medidas à mão</a></div>`;

// ---------- AVALIAÇÃO FÍSICA ----------
export async function telaAvaliacao() {
  const avs = q(await sb.from("avaliacoes").select("*").order("data", { ascending: false }));
  const ult = avs[0], ant = avs[1];
  let corpo = vazioAv();
  if (ult) {
    const chaves = [...new Set([...Object.keys(ult.medidas || {}), ...Object.keys(ant?.medidas || {})])];
    const prox = avs.find((a) => a.proxima)?.proxima;
    const dias = prox ? Math.ceil((new Date(prox + "T12:00") - new Date()) / 864e5) : null;
    const comp = (rot, campo, un, bomSubir) => `<div class="stat"><span class="mini mudo">${rot}</span><span class="v">${ult[campo] != null ? fmt(ult[campo]) + un : "—"}</span>${delta(ult[campo], ant?.[campo], bomSubir, un ? " " + un.trim() : "")}</div>`;
    const bomSubir = (k) => !/cintura|abdomen|quadril/.test(normal(k));
    corpo = `
      <div class="grade2">${comp("Peso", "peso", " kg", false)}${comp("Gordura", "gordura", " %", false)}${comp("Massa magra", "massa_magra", " kg", true)}${comp("IMC", "imc", "", false)}</div>
      ${chaves.length ? `<div class="cartao"><table class="tabela"><thead><tr><th>Medida (cm)</th><th>${ant ? dataCurta(ant.data + "T12:00") : "Antes"}</th><th>${dataCurta(ult.data + "T12:00")}</th><th>Dif.</th></tr></thead><tbody>
        ${chaves.map((k) => { const a = ant?.medidas?.[k], b = ult.medidas?.[k]; return `<tr><td>${h(k)}</td><td class="mudo">${fmt(a)}</td><td><b>${fmt(b)}</b></td><td>${a != null && b != null ? delta(b, a, bomSubir(k)) : "—"}</td></tr>`; }).join("")}
      </tbody></table></div>` : ""}
      ${dias != null ? `<div class="cartao tracejado"><div class="linha"><span class="ac">${ico("calendario", 22)}</span><div class="col" style="gap:2px">
        <b>${dias > 0 ? `Próxima avaliação em ${dias} dia${dias > 1 ? "s" : ""}` : dias === 0 ? "Avaliação é hoje" : "Avaliação atrasada"}</b><span class="mini mudo">${new Date(prox + "T12:00").toLocaleDateString("pt-BR")}</span></div></div></div>` : ""}
      <div class="col"><span class="rot">Histórico</span>${avs.map((a) => `<div class="item"><span class="col" style="flex:1;gap:2px"><b>${new Date(a.data + "T12:00").toLocaleDateString("pt-BR")}</b>
        <span class="mini mudo">${{ print: "Da academia (print)", casa: "Medida em casa", manual: "Lançada à mão" }[a.origem] || a.origem}${a.peso ? " · " + kg(a.peso) : ""}</span></span>
        <button class="ico" style="width:36px;height:36px" data-acao="apagarAv" data-id="${a.id}" aria-label="Apagar avaliação">${ico("lixo", 16)}</button></div>`).join("")}</div>`;
  }
  render(`<section class="tela">
    <div class="topo"><div class="tit"><h1>Avaliação física</h1>${ult ? `<span class="mini mudo">${new Date(ult.data + "T12:00").toLocaleDateString("pt-BR")} · ${ult.origem === "print" ? "importada por print" : ult.origem === "casa" ? "medida em casa" : "lançada à mão"}</span>` : ""}</div></div>
    ${corpo}
    ${ult ? `<div class="grade2"><a class="btn" href="#/medir">${ico("mais", 18)} Medir em casa</a><a class="btn pri" href="#/print?tipo=avaliacao">${ico("camera", 18)} Nova por print</a></div>` : ""}
  </section>${nav("#/avaliacao")}`);
}
acoes.apagarAv = async (el) => {
  if (!confirm("Apagar esta avaliação?")) return;
  q(await sb.from("avaliacoes").delete().eq("id", el.dataset.id));
  toast("Avaliação apagada"); telaAvaliacao();
};
export async function telaMedirCasa() {
  const ult = q(await sb.from("avaliacoes").select("medidas").order("data", { ascending: false }).limit(1))[0];
  const medidas = Object.fromEntries(Object.keys(ult?.medidas || {}).map((k) => [k, null]));
  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/avaliacao")}<div class="tit"><h2>Medir em casa</h2><span class="mini mudo">Fita métrica, de manhã, antes de treinar</span></div></div>
    ${formAvaliacao({ medidas }, "salvarCasa", "Nova medição")}
  </section>`);
}
acoes.salvarCasa = async (form) => {
  q(await sb.from("avaliacoes").insert({ ...lerFormAvaliacao(form), origem: "casa" }));
  toast("Medidas salvas"); ir("#/avaliacao");
};

// ---------- RESUMO DA SEMANA ----------
function chaveManter(exId, carga) { return `manter-${exId}-${carga}`; }
export async function telaSemana() {
  const ini = inicioSemana();
  const fimSem = new Date(ini); fimSem.setDate(fimSem.getDate() + 6);
  const sessoes = q(await sb.from("sessoes").select("id, inicio").order("inicio", { ascending: false }).limit(400));
  const daSemana = sessoes.filter((s) => new Date(s.inicio) >= ini);
  const ids = daSemana.map((s) => s.id);
  const ser = ids.length ? q(await sb.from("series_feitas").select("*").in("sessao_id", ids)) : [];
  const volume = ser.reduce((a, x) => a + (Number(x.carga) || 0) * (Number(x.reps) || 0), 0);

  // sequência de semanas com pelo menos 1 treino
  let seq = 0; const semanas = new Set(sessoes.map((s) => inicioSemana(new Date(s.inicio)).getTime()));
  const cur = new Date(ini);
  if (!semanas.has(cur.getTime())) cur.setDate(cur.getDate() - 7);
  while (semanas.has(cur.getTime())) { seq++; cur.setDate(cur.getDate() - 7); }

  // séries por grupo muscular
  const grupos = {}; ser.forEach((x) => { const g = grupoDe(x.exercicio_nome); grupos[g] = (grupos[g] || 0) + 1; });
  const linhasGrupo = Object.keys(METAS).map((g) => {
    const feito = grupos[g] || 0, meta = METAS[g], foco = g === "Ombro" || g === "Braço";
    const pct = Math.min(100, Math.round((feito / meta) * 100));
    return `<div class="col" style="gap:5px"><div class="entre peq"><span style="${foco ? "color:var(--ac);font-weight:600" : ""}">${g}${foco ? " · foco" : ""}</span><span class="mudo">${feito} / ${meta}${feito >= meta ? " ✓" : ""}</span></div>
      <div class="barra" style="height:8px"><div style="width:${pct}%;${feito >= meta || foco ? "" : "background:var(--fraco)"}"></div></div></div>`;
  }).join("");

  // sugestão de carga: bateu o máximo de repetições em todas as séries na última vez
  const exs = q(await sb.from("exercicios").select("id, nome, series, reps, carga_prevista").eq("ativo", true));
  const exIds = exs.map((e) => e.id);
  const hist = exIds.length ? q(await sb.from("series_feitas").select("exercicio_id, sessao_id, carga, reps, equipamento_opcao, feita_em").in("exercicio_id", exIds).order("feita_em", { ascending: false }).limit(800)) : [];
  const sugestoes = [];
  for (const e of exs) {
    const meta = metaReps(e.reps); if (!meta) continue;
    const xs = hist.filter((x) => x.exercicio_id === e.id); if (!xs.length) continue;
    const ult = xs.filter((x) => x.sessao_id === xs[0].sessao_id && x.equipamento_opcao === xs[0].equipamento_opcao);
    const carga = Number(ult[0].carga);
    if (!carga || ult.length < e.series) continue;
    if (!ult.every((x) => Number(x.carga) >= carga && (x.reps || 0) >= meta.max)) continue;
    let ignorado = false;
    try { ignorado = !!localStorage.getItem(chaveManter(e.id, carga)); } catch { /* */ }
    if (ignorado) continue;
    sugestoes.push({ e, carga, nova: carga + (carga >= 40 ? 5 : 2), meta });
  }

  const recordes = await contarRecordes(ser, ini);
  render(`<section class="tela">
    <div class="entre" style="align-items:flex-end"><div class="col" style="gap:4px"><span class="peq mudo">${ini.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${fimSem.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</span><h1>Sua semana</h1></div>
      <span class="chip" style="color:var(--txt)">${ico("fogo", 14, 'style="color:var(--lar);vertical-align:-2px"')} ${seq} semana${seq === 1 ? "" : "s"} seguida${seq === 1 ? "" : "s"}</span></div>
    ${sugestoes.slice(0, 3).map((s) => `<div class="cartao"><div class="linha"><span class="ac">${ico("sobe", 18)}</span><span class="rot ac">Sugestão de carga</span></div>
      <span style="line-height:1.45">Você fez <b>${s.meta.max} repetições em todas as séries</b> de ${h(s.e.nome)}. Na próxima, tente <b>${kg(s.nova)}</b> (antes ${kg(s.carga)}).</span>
      <div class="linha"><button class="btn pri peq" data-acao="aplicarSug" data-id="${s.e.id}" data-c="${s.nova}">Aplicar</button><button class="btn peq" data-acao="manterSug" data-id="${s.e.id}" data-c="${s.carga}">Manter ${kg(s.carga)}</button></div></div>`).join("")}
    <div class="cartao"><div class="entre"><b>Séries por músculo</b><span class="mini mudo">meta semanal</span></div>${linhasGrupo}</div>
    <div class="grade3"><div class="stat"><span class="mini mudo">Treinos</span><span class="v">${daSemana.length}</span></div>
      <div class="stat"><span class="mini mudo">Volume</span><span class="v">${volumeTxt(volume)}</span></div>
      <div class="stat"><span class="mini mudo">Recordes</span><span class="v ac">${recordes}</span></div></div>
  </section>${nav("#/semana")}`);
}
async function contarRecordes(ser, ini) {
  const ids = [...new Set(ser.map((x) => x.exercicio_id).filter(Boolean))];
  if (!ids.length) return 0;
  const antes = q(await sb.from("series_feitas").select("exercicio_id, carga").in("exercicio_id", ids).lt("feita_em", ini.toISOString()));
  return ids.filter((id) => {
    const a = antes.filter((x) => x.exercicio_id === id).map((x) => Number(x.carga) || 0);
    const b = ser.filter((x) => x.exercicio_id === id).map((x) => Number(x.carga) || 0);
    return a.length && Math.max(...b) > Math.max(...a);
  }).length;
}
acoes.aplicarSug = async (el) => {
  q(await sb.from("exercicios").update({ carga_prevista: Number(el.dataset.c) }).eq("id", el.dataset.id));
  toast(`Nova carga: ${kg(el.dataset.c)}`); telaSemana();
};
acoes.manterSug = (el) => {
  try { localStorage.setItem(chaveManter(el.dataset.id, Number(el.dataset.c)), "1"); } catch { /* */ }
  telaSemana();
};
