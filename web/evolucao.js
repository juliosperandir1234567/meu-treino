// Evolução (medidas, cargas, peso), avaliação física e resumo da semana.
import {
  sb, acoes, render, ir, h, toast, q, fmt, kg, dataCurta, inicioSemana, ico, botaoVoltar, nav, grafico,
  normal, metaReps, grupoDe, METAS, corpoSvg, barrasSemana,
} from "./util.js";
import { formAvaliacao, lerFormAvaliacao, tabelaComparativa } from "./print.js";
import { volumeTxt } from "./treino.js";

const achar = (med, ...chaves) => {
  const ks = Object.keys(med || {});
  for (const c of chaves) { const k = ks.find((x) => normal(x).includes(c)); if (k) return k; }
  return null;
};
function valorBraco(med) {
  const ks = Object.keys(med || {}).filter((k) => normal(k).includes("braco") && !normal(k).includes("antebraco") && !normal(k).includes("dobra"));
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
// título do gráfico: o nome como está; só acrescenta "(cm)" se o nome não trouxer unidade
function tituloMedida(nome) {
  const temUnidade = /\(\s*(cm|mm|kg|m|%)\s*\)/i.test(nome) || /peso|imc|gordura|altura|dobra/i.test(nome);
  return temUnidade ? nome : nome + " (cm)";
}
// rótulo embaixo do ponto: "Janeiro/2026" → "Jan/26"; sem rótulo, a data (dd/mm)
function rotuloCurto(a) {
  const m = (a.rotulo || "").match(/^(\p{L}{3})\p{L}*\s*\/\s*\d{0,2}(\d{2})$/u);
  return m ? `${m[1]}/${m[2]}` : dataCurta(a.data + "T12:00");
}
let medidaSel = null;
export async function telaEvolucao(aba, exNome) {
  // a aba de exercícios não usa as avaliações: não busca à toa
  const avs = aba === "medidas" || aba === "peso" ? q(await sb.from("avaliacoes").select("*").order("data")) : [];
  let corpo = "";
  if (aba === "medidas") {
    const ult = avs[avs.length - 1], ant = avs[avs.length - 2];
    // sem medida de ombro: usa o tórax/peito (também mostra se o tronco está crescendo)
    const temOmbro = avs.some((a) => achar(a.medidas || {}, "ombro"));
    const rotOmbro = temOmbro ? "Ombro" : "Tórax";
    const ombro = (a) => a ? a.medidas[temOmbro ? achar(a.medidas, "ombro") : achar(a.medidas, "torax", "peito")] ?? null : null;
    const cint = (a) => a ? a.medidas[achar(a.medidas, "cintura", "abdomen")] ?? null : null;
    const chaves = [...new Set(avs.flatMap((a) => Object.keys(a.medidas || {})))];
    if (!medidaSel || !chaves.includes(medidaSel)) medidaSel = achar(Object.fromEntries(chaves.map((k) => [k, 1])), "braco direito", "braco") || chaves[0];
    corpo = !avs.length ? vazioAv() : `
      <div class="grade3">
        <div class="stat"><span class="mini mudo">Braço</span><span class="v">${fmt(valorBraco(ult?.medidas))}</span>${delta(valorBraco(ult?.medidas), valorBraco(ant?.medidas), true, " cm")}</div>
        <div class="stat"><span class="mini mudo">${rotOmbro}</span><span class="v">${fmt(ombro(ult))}</span>${delta(ombro(ult), ombro(ant), true, " cm")}</div>
        <div class="stat"><span class="mini mudo">Cintura</span><span class="v">${fmt(cint(ult))}</span>${delta(cint(ult), cint(ant), false, " cm")}</div></div>
      ${chaves.length ? `<div class="cartao"><div class="col" style="gap:8px"><b>${h(tituloMedida(medidaSel))}</b>
        <select class="inp" style="min-height:40px;font-size:14px" onchange="window.__medida(this.value)" aria-label="Escolher medida">${chaves.map((k) => `<option ${k === medidaSel ? "selected" : ""}>${h(k)}</option>`).join("")}</select></div>
        ${grafico(avs.map((a) => a.medidas[medidaSel] ?? null), avs.map(rotuloCurto), { datas: avs.map((a) => a.data + "T12:00") })}</div>` : ""}`;
  } else if (aba === "peso") {
    const comPeso = avs.filter((a) => a.peso != null);
    const ult = comPeso[comPeso.length - 1], ant = comPeso[comPeso.length - 2];
    corpo = !comPeso.length ? vazioAv() : `
      <div class="grade2"><div class="stat"><span class="mini mudo">Peso</span><span class="v">${kg(ult.peso)}</span>${delta(ult.peso, ant?.peso, false, " kg")}</div>
        <div class="stat"><span class="mini mudo">Gordura</span><span class="v">${ult.gordura != null ? fmt(ult.gordura) + " %" : "—"}</span>${delta(ult.gordura, ant?.gordura, false, " pts")}</div></div>
      <div class="cartao"><b>Peso (kg)</b>${grafico(comPeso.map((a) => Number(a.peso)), comPeso.map(rotuloCurto), { datas: comPeso.map((a) => a.data + "T12:00") })}</div>`;
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
    <div class="col" style="gap:4px"><h1>Evolução</h1><span class="peq mudo">Meta: braço e ombro subindo, cintura descendo</span></div>
    <div class="abas">${[["medidas", "Medidas"], ["cargas", "Cargas"], ["peso", "Peso"]].map(([k, t]) => `<button class="${aba === k ? "at" : ""}" data-acao="abaEvo" data-a="${k}">${t}</button>`).join("")}</div>
    ${corpo}
    <a class="btn" href="#/avaliacao">${ico("pessoa", 18)} Avaliação física completa</a>
  </section>${nav("#/evolucao")}`);
}
window.__medida = (v) => { medidaSel = v; telaEvolucao("medidas"); };
acoes.abaEvo = (el) => ir(`#/evolucao?aba=${el.dataset.a}`);
const vazioAv = () => `<div class="cartao vazio"><p style="margin:0">Nenhuma avaliação ainda.</p>
  <a class="btn pri blk" href="#/print?tipo=avaliacao">${ico("lista", 18)} Colar texto ou print da avaliação</a><a class="btn blk" href="#/medir">Lançar medidas à mão</a></div>`;

// ---------- AVALIAÇÃO FÍSICA ----------
export async function telaAvaliacao() {
  const avs = q(await sb.from("avaliacoes").select("*").order("data", { ascending: false }));
  const ult = avs[0], ant = avs[1];
  let corpo = vazioAv();
  if (ult) {
    const chaves = [...new Set([...Object.keys(ult.medidas || {}), ...Object.keys(ant?.medidas || {})])];
    const prox = avs.find((a) => a.proxima)?.proxima;
    const dias = prox ? Math.ceil((new Date(prox + "T12:00") - new Date()) / 864e5) : null;
    const comp = (rot, campo, un, bomSubir) => `<div class="stat"><span class="mini mudo">${rot}</span><span class="v">${ult[campo] != null ? String(Math.round(ult[campo] * 100) / 100).replace(".", ",") + un : "—"}</span>${delta(ult[campo], ant?.[campo], bomSubir, un ? " " + un.trim() : "")}</div>`;
    const bomSubir = (k) => !/cintura|abdomen|quadril/.test(normal(k));
    corpo = `
      <div class="grade2">${comp("Peso", "peso", " kg", false)}${comp("Gordura", "gordura", " %", false)}${comp("Massa magra", "massa_magra", " kg", true)}${comp("IMC", "imc", "", false)}</div>
      ${chaves.length || avs.length > 1 ? `<div class="cartao"><div class="entre"><b>Comparativo</b><span class="mini mudo">${avs.length > 3 ? "3 mais recentes" : avs.length + " avaliaç" + (avs.length > 1 ? "ões" : "ão")}</span></div>
        ${tabelaComparativa([...avs].reverse().slice(-3))}</div>` : ""}
      ${dias != null ? `<div class="cartao tracejado"><div class="linha"><span class="ac">${ico("calendario", 22)}</span><div class="col" style="gap:2px">
        <b>${dias > 0 ? `Próxima avaliação em ${dias} dia${dias > 1 ? "s" : ""}` : dias === 0 ? "Avaliação é hoje" : "Avaliação atrasada"}</b><span class="mini mudo">${new Date(prox + "T12:00").toLocaleDateString("pt-BR")}</span></div></div></div>` : ""}
      <div class="col"><span class="rot">Histórico</span>${avs.map((a) => `<div class="item"><span class="col" style="flex:1;gap:2px"><b>${a.rotulo ? h(a.rotulo) + " · " : ""}${new Date(a.data + "T12:00").toLocaleDateString("pt-BR")}</b>
        <span class="mini mudo">${{ print: "Da academia (print)", texto: "Colada em texto", casa: "Medida em casa", manual: "Lançada à mão" }[a.origem] || a.origem}${a.peso ? " · " + kg(a.peso) : ""}</span></span>
        <button class="ico" style="width:36px;height:36px" data-acao="apagarAv" data-id="${a.id}" aria-label="Apagar avaliação">${ico("lixo", 16)}</button></div>`).join("")}</div>`;
  }
  render(`<section class="tela">
    <div class="topo"><div class="tit"><h1>Avaliação física</h1>${ult ? `<span class="mini mudo">${new Date(ult.data + "T12:00").toLocaleDateString("pt-BR")} · ${ult.origem === "print" ? "importada por print" : ult.origem === "texto" ? "colada em texto" : ult.origem === "casa" ? "medida em casa" : "lançada à mão"}</span>` : ""}</div></div>
    ${corpo}
    ${ult ? `<div class="grade2"><a class="btn" href="#/medir">${ico("mais", 18)} Medir em casa</a><a class="btn pri" href="#/print?tipo=avaliacao">${ico("lista", 18)} Nova (texto ou print)</a></div>` : ""}
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
// dados da semana atual e da anterior (usado na tela Semana e no card para compartilhar)
export async function dadosSemana() {
  const ini = inicioSemana();
  const fimSem = new Date(ini); fimSem.setDate(fimSem.getDate() + 6);
  const iniAnt = new Date(ini); iniAnt.setDate(iniAnt.getDate() - 7);
  // consultas em paralelo: o servidor fica longe, então cada ida e volta em sequência pesa
  const [rs, rx] = await Promise.all([
    sb.from("sessoes").select("id, inicio").order("inicio", { ascending: false }).limit(400),
    sb.from("exercicios").select("id, nome, series, reps, carga_prevista").eq("ativo", true),
  ]);
  const sessoes = q(rs), exs = q(rx);
  const daSemana = sessoes.filter((s) => new Date(s.inicio) >= ini);
  const daAnterior = sessoes.filter((s) => { const d = new Date(s.inicio); return d >= iniAnt && d < ini; });
  const ids = [...daSemana, ...daAnterior].map((s) => s.id);
  const exIds = exs.map((e) => e.id);
  const [rser, rhist] = await Promise.all([
    ids.length ? sb.from("series_feitas").select("*").in("sessao_id", ids) : { data: [] },
    exIds.length ? sb.from("series_feitas").select("exercicio_id, sessao_id, carga, reps, equipamento_opcao, feita_em").in("exercicio_id", exIds).order("feita_em", { ascending: false }).limit(800) : { data: [] },
  ]);
  const todas = q(rser), hist = q(rhist);
  const daSem = new Set(daSemana.map((s) => s.id));
  const ser = todas.filter((x) => daSem.has(x.sessao_id)), serAnt = todas.filter((x) => !daSem.has(x.sessao_id));
  const recordesP = contarRecordes(ser, ini);
  const vol = (xs) => xs.reduce((a, x) => a + (Number(x.carga) || 0) * (Number(x.reps) || 0), 0);

  // sequência de semanas com pelo menos 1 treino
  let seq = 0; const semanas = new Set(sessoes.map((s) => inicioSemana(new Date(s.inicio)).getTime()));
  const cur = new Date(ini);
  if (!semanas.has(cur.getTime())) cur.setDate(cur.getDate() - 7);
  while (semanas.has(cur.getTime())) { seq++; cur.setDate(cur.getDate() - 7); }

  // por dia (segunda a domingo): volume; se não houver carga registrada, conta séries
  const inicioDe = Object.fromEntries(sessoes.map((s) => [s.id, s.inicio]));
  const usarVolume = vol(ser) + vol(serAnt) > 0;
  const porDia = (xs) => {
    const a = Array(7).fill(0);
    xs.forEach((x) => { a[(new Date(inicioDe[x.sessao_id]).getDay() + 6) % 7] += usarVolume ? (Number(x.carga) || 0) * (Number(x.reps) || 0) : 1; });
    return a;
  };

  // séries por grupo muscular
  const contaGrupos = (xs) => { const g = {}; xs.forEach((x) => { const k = grupoDe(x.exercicio_nome); g[k] = (g[k] || 0) + 1; }); return g; };

  // comparativo por exercício: melhor série (maior carga, depois mais repetições)
  const resumoEx = (xs) => {
    const r = {};
    xs.forEach((x) => {
      const e = (r[x.exercicio_nome] ||= { carga: null, reps: null, series: 0 });
      const c = x.carga == null ? null : Number(x.carga);
      e.series++;
      if (c != null && (e.carga == null || c > e.carga || (c === e.carga && (x.reps || 0) > (e.reps || 0)))) { e.carga = c; e.reps = x.reps; }
      if (c == null && e.carga == null && (x.reps || 0) > (e.reps || 0)) e.reps = x.reps;
    });
    return r;
  };
  const exAtual = resumoEx(ser), exAnt = resumoEx(serAnt);
  const ordem = [...new Set([...ser, ...serAnt].sort((a, b) => new Date(a.feita_em) - new Date(b.feita_em)).map((x) => x.exercicio_nome))];
  ordem.sort((a, b) => (exAtual[b] ? 1 : 0) - (exAtual[a] ? 1 : 0));

  // sugestão de carga: bateu o máximo de repetições em todas as séries na última vez
  const sugestoes = [], quase = [];
  for (const e of exs) {
    const meta = metaReps(e.reps); if (!meta) continue;
    const xs = hist.filter((x) => x.exercicio_id === e.id); if (!xs.length) continue;
    const ult = xs.filter((x) => x.sessao_id === xs[0].sessao_id && x.equipamento_opcao === xs[0].equipamento_opcao);
    const carga = Number(ult[0].carga);
    if (!carga) continue;
    const bateu = ult.length >= e.series && ult.every((x) => Number(x.carga) >= carga && (x.reps || 0) >= meta.max);
    if (!bateu) {
      const faltam = ult.reduce((a, x) => a + Math.max(0, meta.max - (x.reps || 0)), 0) + Math.max(0, e.series - ult.length) * meta.max;
      if (faltam > 0) quase.push({ e, carga, faltam, meta });
      continue;
    }
    let ignorado = false;
    try { ignorado = !!localStorage.getItem(chaveManter(e.id, carga)); } catch { /* */ }
    if (ignorado) continue;
    sugestoes.push({ e, carga, nova: carga + (carga >= 40 ? 5 : 2), meta });
  }

  return {
    ini, fimSem, seq, sugestoes, quase: quase.sort((a, b) => a.faltam - b.faltam), usarVolume,
    treinos: daSemana.length, treinosAnt: daAnterior.length,
    series: ser.length, seriesAnt: serAnt.length,
    volume: vol(ser), volumeAnt: vol(serAnt),
    dia: porDia(ser), diaAnt: porDia(serAnt),
    grupos: contaGrupos(ser), gruposAnt: contaGrupos(serAnt),
    exAtual, exAnt, ordem,
    recordes: await recordesP,
  };
}
export const pctGrupos = (grupos) => Object.fromEntries(Object.keys(METAS).map((g) => [g, Math.min(1, (grupos[g] || 0) / METAS[g])]));

// compara a melhor série desta semana (a) com a da semana passada (b)
function setaComp(a, b) {
  if (!a || !b) return `<span class="mini mudo">${a ? "novo" : ""}</span>`;
  const d = a.carga != null && b.carga != null ? a.carga - b.carga : 0;
  const dr = (a.reps || 0) - (b.reps || 0);
  if (d > 0 || (d === 0 && dr > 0)) return `<span class="ac" aria-label="subiu">▲</span>`;
  if (d < 0 || (d === 0 && dr < 0)) return `<span class="lar" aria-label="caiu">▼</span>`;
  return `<span class="mudo" aria-label="igual">=</span>`;
}
const serieTxt = (e) => !e ? "—" : e.carga != null ? `${fmt(e.carga)} kg${e.reps ? " × " + e.reps : ""}` : e.reps ? `${e.reps} reps` : `${e.series} sér.`;
function pctTxt(a, b) {
  if (!b) return a ? `<span class="mini ac">novo</span>` : `<span class="mini mudo">—</span>`;
  const p = Math.round(((a - b) / b) * 100);
  if (!p) return `<span class="mini mudo">igual</span>`;
  return `<span class="mini ${p > 0 ? "ac" : "lar"}" style="font-weight:600">${p > 0 ? "▲ +" : "▼ "}${p}%</span>`;
}

function resumoFrase(d) {
  if (!d.treinos) return d.treinosAnt ? "Ainda sem treino nesta semana. Bora começar!" : "Seu resumo aparece aqui depois do primeiro treino";
  if (!d.volumeAnt) return `${d.treinos} treino${d.treinos === 1 ? "" : "s"} feito${d.treinos === 1 ? "" : "s"} nesta semana`;
  const pct = Math.round(((d.volume - d.volumeAnt) / d.volumeAnt) * 100);
  if (pct >= 5) return `Você levantou ${pct}% a mais que na semana passada`;
  if (pct <= -5) return `${Math.abs(pct)}% abaixo da semana passada até agora`;
  return "No mesmo ritmo da semana passada";
}
export async function telaSemana() {
  const d = await dadosSemana();
  const { ini, fimSem, seq, sugestoes } = d;
  const linhasGrupo = Object.keys(METAS).map((g) => {
    const feito = d.grupos[g] || 0, antes = d.gruposAnt[g] || 0, meta = METAS[g], foco = g === "Ombro" || g === "Braço";
    const pct = Math.min(100, Math.round((feito / meta) * 100)), pctAnt = Math.min(100, Math.round((antes / meta) * 100));
    return `<div class="col" style="gap:5px"><div class="entre peq"><span style="${foco ? "color:var(--ac);font-weight:600" : ""}">${g}${foco ? " · foco" : ""}</span><span class="mudo">${feito} / ${meta}${feito >= meta ? " ✓" : ""}<span class="mini"> · antes ${antes}</span></span></div>
      <div style="position:relative"><div class="barra" style="height:8px"><div style="width:${pct}%;${feito >= meta || foco ? "" : "background:var(--fraco)"}"></div></div>
      ${antes ? `<span class="marca-ant" style="left:calc(${pctAnt}% - 1px)" title="semana passada"></span>` : ""}</div></div>`;
  }).join("");
  const comp = d.ordem.slice(0, 14).map((n) => `<span class="n">${h(n)}</span><span class="num mudo peq">${serieTxt(d.exAnt[n])}</span><span class="num"><b>${serieTxt(d.exAtual[n])}</b> ${setaComp(d.exAtual[n], d.exAnt[n])}</span>`).join("");
  const unid = d.usarVolume ? "Volume" : "Séries";
  render(`<section class="tela">
    <div class="entre" style="align-items:flex-end"><div class="col" style="gap:4px"><span class="peq mudo">${ini.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${fimSem.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</span><h1>Sua semana</h1></div>
      <span class="chip" style="color:var(--txt)">${ico("fogo", 14, 'style="color:var(--lar);vertical-align:-2px"')} ${seq} semana${seq === 1 ? "" : "s"} seguida${seq === 1 ? "" : "s"}</span></div>
    <div class="heroi">
      <div class="entre"><span class="rot ac">Plano desta semana</span><span class="mini mudo">pelo seu último treino</span></div>
      <h2 class="heroi-tit">${sugestoes.length ? `Hora de subir a carga em ${sugestoes.length} exercício${sugestoes.length === 1 ? "" : "s"}` : d.quase.length ? "Mantenha as cargas e busque mais repetições" : "Treine para receber sugestões de carga"}</h2>
      ${sugestoes.slice(0, 4).map((s) => `<div class="sug">
        <div class="entre" style="gap:10px;align-items:flex-start"><div class="col" style="gap:2px;min-width:0"><b>${h(s.e.nome)}</b><span class="mini mudo">Fez ${s.meta.max} repetições em todas as séries</span></div>
          <div class="sug-carga"><span>${kg(s.carga)}</span>${ico("seta", 16)}<b>${kg(s.nova)}</b></div></div>
        <div class="grade2"><button class="btn pri peq" data-acao="aplicarSug" data-id="${s.e.id}" data-c="${s.nova}">Subir para ${kg(s.nova)}</button><button class="btn peq" data-acao="manterSug" data-id="${s.e.id}" data-c="${s.carga}">Manter ${kg(s.carga)}</button></div></div>`).join("")}
      ${d.quase.length && sugestoes.length < 3 ? `<div class="col" style="gap:8px"><span class="mini mudo" style="font-weight:600">QUASE LÁ</span>
        ${d.quase.slice(0, 3 - Math.min(sugestoes.length, 2)).map((x) => `<div class="sug quase"><div class="col" style="gap:2px;min-width:0;flex:1"><b>${h(x.e.nome)}</b><span class="mini mudo">${kg(x.carga)} · faça ${x.meta.max} reps em todas as séries para subir</span></div>
          <span class="chip">faltam ${x.faltam} rep${x.faltam === 1 ? "" : "s"}</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="cartao destaque">
      <div class="col" style="gap:4px"><span class="rot ac">Como foi sua semana</span>
        <h2>${resumoFrase(d)}</h2></div>
      <div class="grade3 mini-stats"><div><span class="mini mudo">Treinos</span><b>${d.treinos}</b>${pctTxt(d.treinos, d.treinosAnt)}</div>
        <div><span class="mini mudo">Volume</span><b>${volumeTxt(d.volume)}</b>${pctTxt(d.volume, d.volumeAnt)}</div>
        <div><span class="mini mudo">Recordes</span><b class="ac">${d.recordes}</b><span class="mini mudo">na semana</span></div></div>
      <div class="entre"><b class="peq">${unid} por dia</b><span class="legenda"><span><i style="background:#C9D3E1"></i>Passada</span><span><i style="background:var(--ac)"></i>Esta</span></span></div>
      ${d.series || d.seriesAnt ? barrasSemana(d.dia, d.diaAnt, ["S", "T", "Q", "Q", "S", "S", "D"]) : `<span class="mudo peq">Faça um treino para ver o gráfico.</span>`}</div>
    <div class="cartao destaque"><div class="entre"><b>Exercícios: passada × esta</b><span class="mini mudo">melhor série</span></div>
      ${comp ? `<div class="comp"><span class="mini mudo">Exercício</span><span class="mini mudo num">Passada</span><span class="mini mudo num">Esta</span>${comp}</div>` : `<span class="mudo peq">Ainda não há séries nestas duas semanas.</span>`}</div>
    <div class="cartao"><div class="entre"><b>Músculos da semana</b><span class="mini mudo">mais forte = mais séries</span></div>
      ${corpoSvg(pctGrupos(d.grupos))}
      ${linhasGrupo}
      <span class="mini mudo"><span style="display:inline-block;width:2px;height:10px;background:var(--txt);opacity:.55;vertical-align:-1px"></span> semana passada · números = séries feitas / meta da semana</span></div>
    <a class="item" href="#/conquistas"><span class="letra g">🏆</span><span class="col" style="flex:1;gap:2px"><b>Calendário e conquistas</b><span class="mini mudo">Seus dias de treino e as medalhas que já ganhou</span></span><span class="mudo">${ico("seta", 18)}</span></a>
    <a class="btn pri blk" href="#/publicar-semana">${ico("share", 18)} Compartilhar minha semana</a>
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
