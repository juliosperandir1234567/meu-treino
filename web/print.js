// Atualizar por print: lê o print com IA, mostra o que mudou e salva. Também lê avaliação física.
import {
  sb, acoes, mudancas, render, ir, h, toast, q, num, kg, normal, ico, botaoVoltar,
  reduzir, blobBase64, enviarFoto, carregarImagem,
} from "./util.js";

let P = { tipo: "treino", qual: "", imgs: [], lendo: false, res: null, destino: null, novaLetra: "", novaNome: "", marc: {}, fichas: [] };

export async function telaPrint(tipo) {
  if (P.tipo !== tipo) P = { ...P, tipo, res: null };
  if (P.res && P.tipo === "treino") return desenharRevisao();
  if (P.res && P.tipo === "avaliacao") return desenharAvaliacao();
  desenharEscolha();
}

function desenharEscolha() {
  render(`<section class="tela">
    <div class="topo">${botaoVoltar(P.tipo === "avaliacao" ? "#/avaliacao" : "#/hoje")}<div class="tit"><h2>Atualizar por print</h2></div></div>
    <div class="abas"><button class="${P.tipo === "treino" ? "at" : ""}" data-acao="tipoPrint" data-t="treino">Treino</button>
      <button class="${P.tipo === "avaliacao" ? "at" : ""}" data-acao="tipoPrint" data-t="avaliacao">Avaliação física</button></div>
    <div class="cartao">
      <b>${P.tipo === "treino" ? "Mande o print da ficha" : "Mande o print da avaliação"}</b>
      <span class="peq mudo">${P.tipo === "treino"
        ? "Pode ser print do app da academia ou foto da ficha de papel (impressa ou à mão). No app, abra os exercícios (a setinha ⌄) antes do print. Até 6 imagens."
        : "Mande os prints com peso, % de gordura e as medidas. Pode mandar até 6."}</span>
      ${P.imgs.length ? `<div class="prints">${P.imgs.map((im, i) => `<button data-acao="tirarPrint" data-i="${i}" aria-label="Remover print ${i + 1}" style="padding:0;border:0;background:none"><img src="${im.url}" alt="Print ${i + 1}"></button>`).join("")}</div>
        <span class="mini mudo">Toque num print para remover.</span>` : ""}
      ${P.tipo === "treino" ? `<label class="campo">Qual treino da ficha? <span class="mini mudo">(opcional, se tiver A, B, C na mesma folha)</span>
        <input class="inp" data-muda="qualTreino" value="${h(P.qual)}" placeholder="Ex.: B" maxlength="20"></label>` : ""}
      <button class="btn blk" data-acao="addPrint">${ico("imagem", 18)} ${P.imgs.length ? "Adicionar mais prints" : "Escolher prints"}</button>
    </div>
  </section>
  <div class="rodape"><div><button class="btn pri" data-acao="lerPrint" ${P.imgs.length && !P.lendo ? "" : "disabled"}>${P.lendo ? '<span class="girando"></span> Lendo o print…' : "Ler print"}</button></div></div>`);
}
mudancas.qualTreino = (el) => { P.qual = el.value.trim(); };
acoes.tipoPrint = (el) => { ir(`#/print?tipo=${el.dataset.t}`); };
acoes.addPrint = async () => {
  const inp = document.getElementById("arquivo");
  inp.value = ""; inp.multiple = true; inp.removeAttribute("capture");
  inp.onchange = () => {
    const novos = [...inp.files].slice(0, 6 - P.imgs.length).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    P.imgs.push(...novos); desenharEscolha();
  };
  inp.click();
};
acoes.tirarPrint = (el) => { P.imgs.splice(Number(el.dataset.i), 1); desenharEscolha(); };

acoes.lerPrint = async () => {
  P.lendo = true; desenharEscolha();
  try {
    for (const im of P.imgs) if (!im.dados) { im.blob = await reduzir(im.file, 1600, 0.85); im.dados = await blobBase64(im.blob); }
    const { data, error } = await sb.functions.invoke("ler-print", { body: { tipo: P.tipo, qual: P.tipo === "treino" ? P.qual : "", imagens: P.imgs.map((im) => ({ mime: "image/jpeg", dados: im.dados })) } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.erro || msg; } catch { /* */ }
      throw new Error(msg);
    }
    if (!data?.ok) throw new Error(data?.erro || "Resposta inválida");
    P.res = data.resultado;
    if (P.tipo === "treino") {
      if (!P.res?.exercicios?.length) throw new Error("Não encontrei exercícios nesse print");
      await prepararRevisao();
      desenharRevisao();
    } else desenharAvaliacao();
  } catch (e) {
    toast(`Não consegui ler: ${e.message}`, 5000);
  } finally { P.lendo = false; if (!P.res) desenharEscolha(); }
};

// ---------- revisão do treino ----------
function mesmoNome(a, b) {
  const x = normal(a), y = normal(b);
  return x === y || (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x)));
}
async function prepararRevisao() {
  const fichas = q(await sb.from("fichas").select("*").order("ordem").order("letra"));
  const exs = q(await sb.from("exercicios").select("*").eq("ativo", true).order("ordem"));
  fichas.forEach((f) => { f.exs = exs.filter((e) => e.ficha_id === f.id); });
  P.fichas = fichas;
  const lista = P.res.exercicios;
  let melhor = null, pontos = 0;
  fichas.forEach((f) => {
    const n = lista.filter((p) => f.exs.some((e) => mesmoNome(p.nome, e.nome))).length;
    if (n > pontos) { pontos = n; melhor = f; }
  });
  P.destino = melhor && pontos / lista.length >= 0.4 ? melhor.id : "nova";
  const usadas = new Set(fichas.map((f) => f.letra));
  const tl = (P.res.titulo || "").match(/treino\s+([A-Z])\b/i);
  P.novaLetra = tl && !usadas.has(tl[1].toUpperCase()) ? tl[1].toUpperCase() : ("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !usadas.has(l)) || "X");
  P.novaNome = (P.res.titulo || "").replace(/treino\s+[A-Z]\b\s*[-–·:]?\s*/i, "").trim();
  P.marc = {};
}
function calcularDiferencas() {
  const lista = P.res.exercicios;
  const destino = P.fichas.find((f) => f.id === P.destino);
  const atuais = destino ? destino.exs : [];
  const usados = new Set();
  const itens = lista.map((p, i) => {
    const e = atuais.find((x) => !usados.has(x.id) && mesmoNome(p.nome, x.nome));
    if (!e) return { k: `n${i}`, tipo: "novo", p, i, det: resumo(p) };
    usados.add(e.id);
    const mud = [];
    if (p.series != null && Number(p.series) !== e.series) mud.push("séries");
    if (p.reps != null && normal(p.reps) !== normal(e.reps)) mud.push("reps");
    if (p.carga != null && Number(p.carga) !== Number(e.carga_prevista)) mud.push("carga");
    if (p.descanso_seg != null && Number(p.descanso_seg) !== e.descanso_seg) mud.push("descanso");
    if (!mud.length) return { k: `i${i}`, tipo: "igual", p, e, i, det: resumo({ series: e.series, reps: e.reps, carga: e.carga_prevista }) };
    const novo = { series: p.series ?? e.series, reps: p.reps ?? e.reps, carga: p.carga ?? e.carga_prevista };
    return { k: `a${i}`, tipo: "alt", p, e, i, det: `era ${resumo({ series: e.series, reps: e.reps, carga: e.carga_prevista })}  →  agora ${resumo(novo)}` };
  });
  atuais.filter((e) => !usados.has(e.id)).forEach((e) => itens.push({ k: `r${e.id}`, tipo: "rem", e, det: "o histórico de cargas fica guardado" }));
  itens.forEach((it) => { if (P.marc[it.k] === undefined) P.marc[it.k] = it.tipo !== "igual"; });
  return itens;
}
function resumo(x) {
  const s = x.series ?? "?", r = x.reps ?? "?";
  return `${s} × ${r}${x.carga ? " · " + kg(x.carga) : ""}`;
}

function desenharRevisao() {
  const itens = calcularDiferencas();
  const cont = (t) => itens.filter((x) => x.tipo === t).length;
  const nomeTag = { novo: "Novo", alt: "Alterado", rem: "Removido", igual: "Igual" };
  const semDetalhe = P.res.exercicios.every((p) => p.series == null && p.reps == null);
  const comFoto = P.res.exercicios.filter((p) => p.miniatura).length;
  render(`<section class="tela">
    <div class="topo"><button class="ico" data-acao="voltarPrint" aria-label="Voltar">${ico("voltar")}</button><div class="tit"><h2>Conferir antes de salvar</h2>
      <span class="mini mudo">Li ${P.res.exercicios.length} exercícios${P.res.titulo ? " · " + h(P.res.titulo) : ""}</span></div></div>
    <div class="cartao">
      <label class="campo">Salvar em
        <select class="inp" data-muda="destinoPrint">
          ${P.fichas.map((f) => `<option value="${f.id}" ${P.destino === f.id ? "selected" : ""}>Treino ${h(f.letra)}${f.nome ? " · " + h(f.nome) : ""} (atualizar)</option>`).join("")}
          <option value="nova" ${P.destino === "nova" ? "selected" : ""}>Criar ficha nova</option>
        </select></label>
      ${P.destino === "nova" ? `<div class="grade2" style="grid-template-columns:80px 1fr">
        <label class="campo">Letra<input class="inp" maxlength="3" value="${h(P.novaLetra)}" data-muda="novaFichaCampo" data-c="novaLetra"></label>
        <label class="campo">Nome<input class="inp" value="${h(P.novaNome)}" placeholder="Ex.: Pernas" data-muda="novaFichaCampo" data-c="novaNome"></label></div>` : ""}
    </div>
    <div class="linha" style="flex-wrap:wrap;gap:8px">
      ${cont("novo") ? `<span class="chip ac">${cont("novo")} novo${cont("novo") > 1 ? "s" : ""}</span>` : ""}
      ${cont("alt") ? `<span class="chip lar">${cont("alt")} alterado${cont("alt") > 1 ? "s" : ""}</span>` : ""}
      ${cont("rem") ? `<span class="chip">${cont("rem")} removido${cont("rem") > 1 ? "s" : ""}</span>` : ""}
      ${cont("igual") ? `<span class="chip">${cont("igual")} igua${cont("igual") > 1 ? "is" : "l"}</span>` : ""}
    </div>
    ${semDetalhe ? `<div class="cartao lar-borda"><span class="peq">O print mostrou só os nomes. Vou manter as séries que já estavam salvas; exercícios novos entram com 3 × 12 para você ajustar.</span></div>` : ""}
    <div class="col">${itens.map((it) => `<label class="item dif">
      <input type="checkbox" data-muda="marcarPrint" data-k="${it.k}" ${P.marc[it.k] ? "checked" : ""} ${it.tipo === "igual" ? "disabled" : ""} aria-label="Aplicar">
      <span class="tag ${it.tipo}">${nomeTag[it.tipo]}</span>
      <span class="col" style="gap:2px;min-width:0"><b class="${it.tipo === "rem" ? "riscado" : ""}">${h(it.p?.nome || it.e.nome)}</b><span class="mini mudo">${h(it.det)}</span></span></label>`).join("")}</div>
    ${cont("rem") ? `<span class="mini mudo">Se o print não mostrou a ficha inteira, desmarque os "Removido".</span>` : ""}
    ${comFoto ? `<span class="mini mudo">${ico("imagem", 14)} ${comFoto} foto${comFoto > 1 ? "s" : ""} de aparelho no print: viram a Opção 1 do equipamento (quando ainda não tem foto).</span>` : ""}
  </section>
  <div class="rodape"><div><button class="btn pri" data-acao="salvarPrint">Salvar ${P.destino === "nova" ? "ficha nova" : "alterações"}</button></div></div>`);
}
acoes.voltarPrint = () => { P.res = null; desenharEscolha(); };
mudancas.destinoPrint = (el) => { P.destino = el.value; P.marc = {}; desenharRevisao(); };
mudancas.novaFichaCampo = (el) => { P[el.dataset.c] = el.value.trim(); };
mudancas.marcarPrint = (el) => { P.marc[el.dataset.k] = el.checked; };

acoes.salvarPrint = async (el) => {
  el.disabled = true; el.innerHTML = '<span class="girando"></span> Salvando…';
  try {
    const itens = calcularDiferencas();
    let fichaId = P.destino;
    if (fichaId === "nova") {
      const f = q(await sb.from("fichas").insert({ letra: P.novaLetra || "X", nome: P.novaNome, ordem: P.fichas.length, origem: "print" }).select().single());
      fichaId = f.id;
    }
    const idPorIndice = {};
    for (const it of itens) {
      const p = it.p;
      if (it.tipo === "novo" && P.marc[it.k]) {
        const r = q(await sb.from("exercicios").insert({
          ficha_id: fichaId, ordem: it.i, nome: p.nome, series: Number(p.series) || 3, reps: p.reps ? String(p.reps) : "12",
          carga_prevista: num(p.carga), descanso_seg: Number(p.descanso_seg) || 90, obs: p.obs || "",
        }).select("id").single());
        idPorIndice[it.i] = r.id;
      } else if (it.tipo === "alt" || it.tipo === "igual") {
        const upd = { ordem: it.i };
        if (it.tipo === "alt" && P.marc[it.k]) {
          if (p.series != null) upd.series = Number(p.series);
          if (p.reps != null) upd.reps = String(p.reps);
          if (p.carga != null) upd.carga_prevista = num(p.carga);
          if (p.descanso_seg != null) upd.descanso_seg = Number(p.descanso_seg);
        }
        q(await sb.from("exercicios").update(upd).eq("id", it.e.id));
        idPorIndice[it.i] = it.e.id;
      } else if (it.tipo === "rem" && P.marc[it.k]) {
        q(await sb.from("exercicios").update({ ativo: false }).eq("id", it.e.id));
      }
    }
    q(await sb.from("fichas").update({ atualizado_em: new Date().toISOString(), origem: "print" }).eq("id", fichaId));
    await salvarMiniaturas(idPorIndice);
    toast("Ficha atualizada pelo print");
    P = { tipo: "treino", imgs: [], lendo: false, res: null, destino: null, novaLetra: "", novaNome: "", marc: {}, fichas: [] };
    ir(`#/ficha/${fichaId}`);
  } catch (e) {
    toast(`Erro ao salvar: ${e.message}`, 5000);
    el.disabled = false; el.textContent = "Tentar de novo";
  }
};

// Recorta a miniatura de cada aparelho do print e usa como Opção 1 (se ainda não houver foto)
async function salvarMiniaturas(idPorIndice) {
  const comFoto = P.res.exercicios.map((p, i) => ({ p, i })).filter(({ p, i }) => Array.isArray(p.miniatura) && p.miniatura.length === 4 && idPorIndice[i]);
  if (!comFoto.length) return;
  const ids = comFoto.map(({ i }) => idPorIndice[i]);
  const ja = q(await sb.from("equipamentos").select("exercicio_id, foto_path").in("exercicio_id", ids).eq("opcao", 1));
  const imgs = {};
  for (const { p, i } of comFoto) {
    if (ja.some((e) => e.exercicio_id === idPorIndice[i] && e.foto_path)) continue;
    try {
      const k = Number(p.imagem) || 0;
      const fonte = P.imgs[k] || P.imgs[0];
      if (!imgs[k]) imgs[k] = await carregarImagem(URL.createObjectURL(fonte.blob || fonte.file));
      const img = imgs[k];
      const [y0, x0, y1, x1] = p.miniatura.map(Number);
      const sx = (x0 / 1000) * img.width, sy = (y0 / 1000) * img.height;
      const sw = ((x1 - x0) / 1000) * img.width, shh = ((y1 - y0) / 1000) * img.height;
      if (sw < 20 || shh < 20) continue;
      const c = document.createElement("canvas"); c.width = Math.round(sw); c.height = Math.round(shh);
      c.getContext("2d").drawImage(img, sx, sy, sw, shh, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.88));
      const path = await enviarFoto(blob, "equipamentos");
      q(await sb.from("equipamentos").upsert({ exercicio_id: idPorIndice[i], opcao: 1, foto_path: path }, { onConflict: "exercicio_id,opcao" }));
    } catch (e) { console.warn("miniatura", e); }
  }
}

// ---------- avaliação física ----------
export const MEDIDAS_PADRAO = ["Braço direito", "Braço esquerdo", "Ombro", "Peito", "Cintura", "Abdômen", "Quadril", "Coxa direita", "Coxa esquerda", "Panturrilha"];

export function formAvaliacao(av, acao, titulo) {
  const med = { ...av.medidas };
  const nomes = [...new Set([...Object.keys(med), ...(Object.keys(med).length ? [] : MEDIDAS_PADRAO)])];
  return `<form class="col" style="gap:16px" data-envia="${acao}">
    <div class="cartao">
      <b>${titulo}</b>
      <div class="grade2">
        <label class="campo">Data<input class="inp" type="date" name="data" value="${h(av.data || new Date().toISOString().slice(0, 10))}"></label>
        <label class="campo">Peso (kg)<input class="inp" name="peso" type="number" inputmode="decimal" step="0.1" value="${av.peso ?? ""}"></label>
        <label class="campo">Gordura (%)<input class="inp" name="gordura" type="number" inputmode="decimal" step="0.1" value="${av.gordura ?? ""}"></label>
        <label class="campo">Massa magra (kg)<input class="inp" name="massa_magra" type="number" inputmode="decimal" step="0.1" value="${av.massa_magra ?? ""}"></label>
        <label class="campo">IMC<input class="inp" name="imc" type="number" inputmode="decimal" step="0.1" value="${av.imc ?? ""}"></label>
        <label class="campo">Próxima avaliação<input class="inp" type="date" name="proxima" value="${h(av.proxima || "")}"></label>
      </div></div>
    <div class="cartao"><b>Medidas (cm)</b>
      <div class="col" id="medidas">${nomes.map((n) => linhaMedida(n, med[n])).join("")}</div>
      <button type="button" class="btn peq" data-acao="addMedida">${ico("mais", 16)} Outra medida</button></div>
    <button class="btn pri blk" type="submit">Salvar avaliação</button>
  </form>`;
}
function linhaMedida(nome, valor) {
  return `<div class="grade2" style="grid-template-columns:1fr 100px"><input class="inp" name="mnome" value="${h(nome)}" aria-label="Nome da medida" placeholder="Medida">
    <input class="inp" name="mvalor" type="number" inputmode="decimal" step="0.1" value="${valor ?? ""}" aria-label="Valor em cm"></div>`;
}
acoes.addMedida = () => { document.getElementById("medidas").insertAdjacentHTML("beforeend", linhaMedida("", "")); };
export function lerFormAvaliacao(form) {
  const f = new FormData(form);
  const nomes = f.getAll("mnome"), vals = f.getAll("mvalor");
  const medidas = {};
  nomes.forEach((n, i) => { const v = num(vals[i]); if (String(n).trim() && v !== null) medidas[String(n).trim()] = v; });
  return {
    data: f.get("data") || new Date().toISOString().slice(0, 10), peso: num(f.get("peso")), gordura: num(f.get("gordura")),
    massa_magra: num(f.get("massa_magra")), imc: num(f.get("imc")), proxima: f.get("proxima") || null, medidas,
  };
}
function desenharAvaliacao() {
  const r = P.res || {};
  render(`<section class="tela">
    <div class="topo"><button class="ico" data-acao="voltarPrint" aria-label="Voltar">${ico("voltar")}</button><div class="tit"><h2>Conferir avaliação</h2>
      <span class="mini mudo">Confira os números lidos do print antes de salvar</span></div></div>
    ${formAvaliacao({ ...r, medidas: r.medidas || {} }, "salvarAvPrint", "Lido do print")}
  </section>`);
}
acoes.salvarAvPrint = async (form) => {
  const d = lerFormAvaliacao(form);
  q(await sb.from("avaliacoes").insert({ ...d, origem: "print" }));
  P = { ...P, imgs: [], res: null };
  toast("Avaliação salva"); ir("#/avaliacao");
};
