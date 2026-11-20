// Calendário de treinos, conquistas (medalhas) e card da semana para compartilhar.
import { sb, sessao, acoes, render, h, q, fmt, ico, botaoVoltar, inicioSemana, comemorar, corpoSvg } from "./util.js";
import { volumeTxt, roundRect, definirImagem } from "./treino.js";
import { dadosSemana, pctGrupos } from "./evolucao.js";

// ---------- estatísticas e sequência de semanas ----------
async function estatisticas() {
  const e = q(await sb.rpc("minhas_estatisticas")) || {};
  const dias = (e.dias || []).map((d) => new Date(d + "T12:00"));
  // melhor e atual sequência de semanas seguidas com pelo menos 1 treino
  const semanas = [...new Set(dias.map((d) => inicioSemana(d).getTime()))].sort((a, b) => a - b);
  let melhor = 0, corrida = 0, ant = null;
  const SEM = 7 * 864e5;
  for (const s of semanas) { corrida = ant !== null && Math.round((s - ant) / SEM) === 1 ? corrida + 1 : 1; melhor = Math.max(melhor, corrida); ant = s; }
  return { treinos: Number(e.treinos) || 0, volume: Number(e.volume) || 0, series: Number(e.series) || 0,
    cargaMax: Number(e.carga_max) || 0, exCargaMax: e.ex_carga_max || "", dias, melhorSeq: melhor };
}

// [ícone, nome, como ganhar, valor atual, meta]
const MEDALHAS = [
  ["🏁", "Primeiro treino", "Termine 1 treino", (e) => e.treinos, 1],
  ["💪", "10 treinos", "Termine 10 treinos", (e) => e.treinos, 10],
  ["🔥", "25 treinos", "Termine 25 treinos", (e) => e.treinos, 25],
  ["⭐", "50 treinos", "Termine 50 treinos", (e) => e.treinos, 50],
  ["👑", "100 treinos", "Termine 100 treinos", (e) => e.treinos, 100],
  ["📅", "2 semanas", "2 semanas seguidas treinando", (e) => e.melhorSeq, 2],
  ["📆", "1 mês firme", "4 semanas seguidas treinando", (e) => e.melhorSeq, 4],
  ["🗓️", "3 meses firme", "12 semanas seguidas treinando", (e) => e.melhorSeq, 12],
  ["🏋️", "50 kg", "Levante 50 kg em um exercício", (e) => e.cargaMax, 50],
  ["🦍", "100 kg", "Levante 100 kg em um exercício", (e) => e.cargaMax, 100],
  ["🚀", "150 kg", "Levante 150 kg em um exercício", (e) => e.cargaMax, 150],
  ["🧱", "10 toneladas", "Some 10 t de volume", (e) => e.volume, 10000],
  ["⛰️", "100 toneladas", "Some 100 t de volume", (e) => e.volume, 100000],
  ["🌋", "500 toneladas", "Some 500 t de volume", (e) => e.volume, 500000],
  ["🎯", "500 séries", "Faça 500 séries", (e) => e.series, 500],
];
const ganhas = (e) => MEDALHAS.filter((m) => m[3](e) >= m[4]).map((m) => m[1]);
const chaveVistas = () => `medalhas-vistas-${sessao.user?.id || ""}`;
function lerVistas() { try { return JSON.parse(localStorage.getItem(chaveVistas()) || "null"); } catch { return null; } }
function salvarVistas(lista) { try { localStorage.setItem(chaveVistas(), JSON.stringify(lista)); } catch { /* */ } }

// Chamado ao terminar um treino: comemora medalhas novas (só uma vez cada)
export async function checarConquistas(atraso = 0) {
  try {
    const e = await estatisticas();
    const agora = ganhas(e), vistas = lerVistas();
    salvarVistas(agora);
    if (!vistas) return;                       // primeira vez neste aparelho: só registra
    const novas = agora.filter((n) => !vistas.includes(n));
    if (novas.length) setTimeout(() => comemorar("Conquista desbloqueada!", novas.join(" · ")), atraso);
  } catch { /* conquistas são extras: nunca atrapalham o fim do treino */ }
}

// ---------- tela: calendário + conquistas ----------
export async function telaConquistas() {
  const e = await estatisticas();
  const ok = ganhas(e);
  if (!lerVistas()) salvarVistas(ok);

  // calendário: últimas 52 semanas, uma coluna por semana (segunda a domingo)
  const feitos = new Set(e.dias.map((d) => d.toDateString()));
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ini = inicioSemana(hoje); ini.setDate(ini.getDate() - 51 * 7);
  const cel = [];
  const umAno = new Date(hoje); umAno.setFullYear(umAno.getFullYear() - 1);
  let noAno = 0;
  for (let d = new Date(ini); cel.length < 52 * 7; d.setDate(d.getDate() + 1)) {
    const f = feitos.has(d.toDateString());
    if (f && d > umAno) noAno++;
    const futuro = d > hoje;
    cel.push(`<span class="${futuro ? "fora" : f ? "f" : ""}${d.getTime() === hoje.getTime() ? " hj" : ""}" title="${d.toLocaleDateString("pt-BR")}${f ? " · treinou" : ""}"></span>`);
  }
  const meses = [];
  for (let i = 0; i < 52; i += 1) {
    const d = new Date(ini); d.setDate(d.getDate() + i * 7);
    if (d.getDate() <= 7) meses.push(`<span style="grid-column:${i + 1}">${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>`);
  }

  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/semana")}<div class="tit"><h2>Calendário e conquistas</h2></div></div>
    <div class="grade3"><div class="stat"><span class="mini mudo">Treinos</span><span class="v">${e.treinos}</span></div>
      <div class="stat"><span class="mini mudo">Volume total</span><span class="v">${volumeTxt(e.volume)}</span></div>
      <div class="stat"><span class="mini mudo">Maior carga</span><span class="v">${e.cargaMax ? fmt(e.cargaMax) + " kg" : "—"}</span></div></div>
    <div class="cartao"><div class="entre"><b>Dias de treino</b><span class="mini mudo">${noAno} no último ano</span></div>
      <div id="calRolo" style="overflow-x:auto">
        <div class="cal-meses" style="display:grid;grid-template-columns:repeat(52,12px);gap:3px;font-size:10px;color:var(--mudo);margin-bottom:4px;width:max-content">${meses.join("")}</div>
        <div class="cal" style="width:max-content">${cel.join("")}</div></div>
      <span class="mini mudo">Melhor sequência: <b style="color:var(--txt)">${e.melhorSeq} semana${e.melhorSeq === 1 ? "" : "s"} seguida${e.melhorSeq === 1 ? "" : "s"}</b>${e.exCargaMax ? ` · maior carga em ${h(e.exCargaMax)}` : ""}</span></div>
    <div class="col"><div class="entre"><h3>Conquistas</h3><span class="chip">${ok.length} de ${MEDALHAS.length}</span></div>
      <div class="medalhas">${MEDALHAS.map(([i, nome, como, val, meta]) => {
        const v = val(e), feito = v >= meta;
        const falta = meta - v;
        const prog = feito ? "Conquistada" : meta >= 1000 ? `faltam ${volumeTxt(falta)}` : `${fmt(v, 0)} / ${meta}`;
        return `<div class="medalha ${feito ? "ganha" : ""}" title="${h(como)}"><span class="m-ico">${i}</span><b>${h(nome)}</b><span>${feito ? prog : h(como)}</span>${feito ? "" : `<span>${prog}</span>`}</div>`;
      }).join("")}</div></div>
  </section>`);
  const rolo = document.getElementById("calRolo");
  if (rolo) rolo.scrollLeft = rolo.scrollWidth;
}

// ---------- card da semana para story/post ----------
let formatoSemana = "story";
export async function telaPublicarSemana() {
  const d = await dadosSemana();
  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/semana")}<div class="tit"><h2>Compartilhar semana</h2></div></div>
    <canvas id="cv" class="prev" aria-label="Prévia da imagem da semana"></canvas>
    <div class="abas">${[["story", "Story"], ["post", "Post"]].map(([k, t]) => `<button class="${formatoSemana === k ? "at" : ""}" data-acao="formatoSemana" data-f="${k}">${t}</button>`).join("")}</div>
  </section>
  <div class="rodape"><div><button class="btn" data-acao="salvarImg">Salvar imagem</button><button class="btn pri" data-acao="compartilhar">${ico("share", 18)} Compartilhar</button></div></div>`);
  definirImagem(null);
  await desenharSemana(d);
}
acoes.formatoSemana = (el) => { formatoSemana = el.dataset.f; telaPublicarSemana(); };

function imagemSvg(svg) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = falha;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
  });
}

export async function desenharSemana(d) {
  const cv = document.getElementById("cv"); if (!cv) return;
  const W = 1080, H = formatoSemana === "story" ? 1920 : 1350;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  try { await document.fonts.ready; } catch { /* */ }
  const ACC = "#C6F432", TXT = "#F2F3F5", MUDO = "#B8BDC4";
  c.fillStyle = "#0E0F11"; c.fillRect(0, 0, W, H);
  c.strokeStyle = ACC; c.lineWidth = 6; c.globalAlpha = .08;
  for (let i = -H; i < W; i += 90) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); }
  c.globalAlpha = 1;
  const M = 72, story = formatoSemana === "story";
  c.textBaseline = "top";
  c.fillStyle = TXT; c.font = "700 46px 'Space Grotesk', sans-serif"; c.fillText("Meu Treino", M, M);
  if (d.seq) {
    c.font = "700 34px Inter, sans-serif";
    const t = `🔥 ${d.seq} semana${d.seq === 1 ? "" : "s"} seguida${d.seq === 1 ? "" : "s"}`, tw = c.measureText(t).width + 48;
    c.fillStyle = ACC; roundRect(c, W - M - tw, M - 6, tw, 62, 31); c.fill();
    c.fillStyle = "#0E0F11"; c.fillText(t, W - M - tw + 24, M + 8);
  }
  let y = M + (story ? 150 : 110);
  c.fillStyle = MUDO; c.font = "500 36px Inter, sans-serif";
  c.fillText(`${d.ini.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${d.fimSem.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`, M, y);
  y += 54;
  c.fillStyle = TXT; c.font = "700 104px 'Space Grotesk', sans-serif"; c.fillText("Minha semana", M, y);
  y += story ? 170 : 140;

  // números grandes
  const cols = [["Treinos", String(d.treinos)], ["Volume", volumeTxt(d.volume)], ["Séries", String(d.series)], ["Recordes", String(d.recordes)]];
  const cw = (W - 2 * M) / 4;
  cols.forEach(([rot, v], i) => {
    c.fillStyle = MUDO; c.font = "500 30px Inter, sans-serif"; c.fillText(rot, M + i * cw, y);
    c.fillStyle = i === 3 && d.recordes ? ACC : TXT; c.font = "700 60px Inter, sans-serif"; c.fillText(v, M + i * cw, y + 42);
  });
  y += story ? 170 : 140;

  // corpo com os músculos e barras por dia
  const corpoH = story ? 640 : 420, corpoW = corpoH * (220 / 214);
  try {
    const img = await imagemSvg(corpoSvg(pctGrupos(d.grupos)).replace('class="corpo"', `width="${corpoW}" height="${corpoH}"`));
    c.drawImage(img, story ? (W - corpoW) / 2 : M, y, corpoW, corpoH);
  } catch { /* desenho indisponível */ }
  if (story) y += corpoH + 60;

  // barras: esta semana × passada
  const bx = story ? M : M + corpoW + 40, bw = W - M - bx, bh = story ? 260 : 300, by = story ? y : y + 40;
  c.fillStyle = MUDO; c.font = "500 30px Inter, sans-serif"; c.fillText(d.usarVolume ? "Volume por dia" : "Séries por dia", bx, by);
  const max = Math.max(1, ...d.dia, ...d.diaAnt), base = by + 50 + bh, larg = bw / 7;
  ["S", "T", "Q", "Q", "S", "S", "D"].forEach((t, i) => {
    const x0 = bx + i * larg + larg * 0.14, w = larg * 0.34;
    const hA = d.diaAnt[i] ? Math.max(6, (bh * d.diaAnt[i]) / max) : 0, hB = d.dia[i] ? Math.max(6, (bh * d.dia[i]) / max) : 0;
    c.fillStyle = "#3A3F47"; if (hA) { roundRect(c, x0, base - hA, w, hA, 8); c.fill(); }
    c.fillStyle = ACC; if (hB) { roundRect(c, x0 + w + 6, base - hB, w, hB, 8); c.fill(); }
    c.fillStyle = MUDO; c.font = "500 28px Inter, sans-serif"; c.textAlign = "center"; c.fillText(t, bx + i * larg + larg / 2, base + 14); c.textAlign = "left";
  });
  c.fillStyle = MUDO; c.font = "500 26px Inter, sans-serif";
  c.fillText("■ semana passada", bx, base + 60); c.fillStyle = ACC; c.fillText("■ esta semana", bx + 270, base + 60);

  definirImagem(await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92)));
}
