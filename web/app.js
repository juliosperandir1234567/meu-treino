// Meu Treino — rotas, login, tela Hoje, fichas e edição de exercícios.
import {
  sb, configOk, sessao, acoes, limpeza, mudancas, render, renderSemRolar, corpoSvg, mostrarGuardada, esquecerTelas, ir, h, toast, erro, q, num, fmt, kg,
  dataLonga, inicioSemana, ico, botaoVoltar, nav, treinoAtivo, salvarTreinoAtivo, grupoDe, abrirFolha, fecharFolha, nomeDoTreino, inicioSemanaTreino,
} from "./util.js";
import { telaTreino, telaEquipamento, telaFim, telaPublicar, iniciarTreino, guardarParaSemInternet } from "./treino.js";
import { pendentes } from "./fila.js";
import { telaPrint } from "./print.js";
import { telaEvolucao, telaAvaliacao, telaMedirCasa, telaSemana } from "./evolucao.js";
import { telaClientes, telaCliente, telaNovoCliente } from "./admin.js";
import { telaConquistas, telaPublicarSemana } from "./conquistas.js";
import { exImg, seloMusculo, musculosDe, carregarMidia, preencherMidia } from "./midia.js";
import { telaPerfil, avatarHtml, telaHistorico } from "./perfil.js";
import { telaBoasVindas } from "./boasvindas.js";
import { telaLembrete, desligarLembreteDoAparelho } from "./lembrete.js";

// ---------- cliques e mudanças (delegação) ----------
document.addEventListener("click", (e) => {
  const aba = e.target.closest?.("nav.nav a");
  if (aba) { aba.parentElement.querySelectorAll("a").forEach((x) => x.classList.toggle("at", x === aba)); }
  const el = e.target.closest("[data-acao]");
  if (!el) return;
  const f = acoes[el.dataset.acao];
  if (f) { e.preventDefault(); Promise.resolve(f(el, e)).catch((x) => erro(x)); }
});
// teclado aberto (campo de número/texto em foco): some com a barra fixa de baixo
document.addEventListener("focusin", (e) => { if (e.target.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) document.body.classList.add("digitando"); });
document.addEventListener("focusout", () => setTimeout(() => { if (!document.activeElement?.matches?.("input, textarea, select")) document.body.classList.remove("digitando"); }, 50));
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-muda]");
  if (!el) return;
  const f = mudancas[el.dataset.muda];
  if (f) Promise.resolve(f(el, e)).catch((x) => erro(x));
});
document.addEventListener("submit", (e) => {
  const f = acoes[e.target.dataset.envia];
  if (f) { e.preventDefault(); Promise.resolve(f(e.target, e)).catch((x) => erro(x)); }
});

// ---------- rotas ----------

// tela de erro com o menu de baixo e botão para tentar de novo (nunca deixa a pessoa presa)
function telaErro(msg = "Não consegui carregar agora.") {
  const aba = ["#/evolucao", "#/semana", "#/avaliacao"].includes(location.hash.split("?")[0]) ? "#/evolucao" : location.hash.startsWith("#/perfil") ? "#/perfil" : "#/hoje";
  render(`<section class="tela"><div class="vazio"><p>${h(msg)}</p><p class="mini mudo" style="margin:0">Pode ser a internet oscilando. Tente de novo.</p>
    <button class="btn pri" data-acao="verificarDeNovo">Tentar de novo</button></div></section>${nav(aba)}`);
}
const buscarPerfil = async () => q(await sb.from("perfis").select("*").eq("id", sessao.user.id).maybeSingle());
async function rota(tentou = false) {
  if (limpeza.fn) { try { limpeza.fn(); } catch { /* */ } limpeza.fn = null; }
  if (!configOk) return telaConfig();
  if (!sessao.user) return telaLogin();
  if (!sessao.perfil || sessao.perfil.id !== sessao.user.id) {
    const chP = "perfil-" + sessao.user.id;
    try {
      let p;
      // ao abrir o app depois de horas o acesso pode estar vencendo: renova e tenta de novo uma vez
      try { p = await buscarPerfil(); } catch (e1) { if (!navigator.onLine) throw e1; await sb.auth.refreshSession().catch(() => {}); p = await buscarPerfil(); }
      sessao.perfil = p;
      try { localStorage.setItem(chP, JSON.stringify(sessao.perfil)); } catch { /* */ }
    } catch (e) {
      // sem internet ou falha: usa o perfil guardado (o servidor continua conferindo tudo quando voltar)
      let g = null; try { g = JSON.parse(localStorage.getItem(chP)); } catch { /* */ }
      if (g) sessao.perfil = g;
      else { sessao.perfil = null; return navigator.onLine ? telaErro("Não consegui verificar sua conta.") : telaSemInternet(); }
    }
  }
  const bloqueio = motivoBloqueio(sessao.perfil);
  if (bloqueio) return telaBloqueada(bloqueio);
  mostrarGuardada();
  const [r, a, b] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const admin = sessao.perfil?.papel === "admin";
  if (!sessao.perfil?.termos_em) return telaBoasVindas();
  try {
    switch (r) {
      case "clientes": if (admin) return await telaClientes(); break;
      case "cliente": if (admin) return a === "novo" ? telaNovoCliente() : await telaCliente(a); break;
      case "": case "hoje": return await telaHoje();
      case "ficha": return await telaFicha(a);
      case "ex": return await telaExercicio(a, b);
      case "treino": return await telaTreino();
      case "equip": return await telaEquipamento(a);
      case "fim": return await telaFim(a);
      case "publicar": return await telaPublicar(a);
      case "print": return await telaPrint(params.get("tipo") || "texto");
      case "evolucao": return await telaEvolucao(params.get("aba") || "medidas", params.get("ex"));
      case "avaliacao": return await telaAvaliacao();
      case "medir": return await telaMedirCasa();
      case "semana": return await telaSemana();
      case "conquistas": return await telaConquistas();
      case "historico": return await telaHistorico();
      case "perfil": return await telaPerfil();
      case "lembrete": return await telaLembrete();
      case "publicar-semana": return await telaPublicarSemana();
      default: return ir("#/hoje");
    }
    return ir("#/hoje");
  } catch (e) {
    // acesso cortado no meio do uso (bloqueio ou vencimento): confere o perfil de novo
    if (e?.code === "42501") {
      try { sessao.perfil = q(await sb.from("perfis").select("*").eq("id", sessao.user.id).maybeSingle()); } catch { /* */ }
      const m = motivoBloqueio(sessao.perfil);
      if (m) return telaBloqueada(m);
    }
    if (!navigator.onLine) return telaSemInternet();
    // primeira falha: renova o acesso e tenta mais uma vez antes de mostrar erro
    if (!tentou) { await sb.auth.refreshSession().catch(() => {}); return rota(true); }
    console.error(e);
    telaErro();
  }
}
window.addEventListener("hashchange", () => rota());

// Sem internet: mostra a última tela Hoje guardada (dá para começar um treino) ou um aviso.
const chHoje = () => "hoje-html-" + sessao.user?.id;
function telaSemInternet() {
  const ativo = treinoAtivo();
  let html = null; try { html = localStorage.getItem(chHoje()); } catch { /* */ }
  const faixa = `<div class="sem-net">${ico("info", 16)} Sem internet. O treino funciona normalmente e é enviado quando a conexão voltar.</div>`;
  if (html && !ativo && /^#\/?(hoje)?$/.test(location.hash || "#/hoje")) { render(html.replace('<section class="tela">', '<section class="tela">' + faixa)); return; }
  render(`<section class="tela">${faixa}<div class="vazio"><p>Esta tela precisa de internet.</p>
    ${ativo ? `<a class="btn pri" href="#/treino">${ico("play", 18)} Continuar treino</a>` : html ? `<a class="btn" href="#/hoje">Ir para o início</a>` : ""}</div></section>${nav(location.hash)}`);
}
window.addEventListener("offline", () => toast("Sem internet: pode continuar o treino, ele fica salvo no celular", 4000));

// só reage a entrar/sair depois da primeira abertura terminar (evita abrir duas vezes ao mesmo tempo)
let pronto = false;
sb.auth.onAuthStateChange((_ev, s) => {
  const antes = sessao.user?.id;
  sessao.user = s?.user || null;
  if (pronto && antes !== sessao.user?.id) { sessao.perfil = null; esquecerTelas(); rota(); }
});
// ao abrir o app (sem tela escolhida no link) começa no Treino
if (["", "#", "#/", "#/perfil"].includes(location.hash)) history.replaceState(null, "", "#/hoje");
(async () => {
  if (configOk) { try { const { data } = await sb.auth.getSession(); sessao.user = data.session?.user || null; } catch { /* sem sessão */ } }
  pronto = true;
  rota();
  setTimeout(perguntarTreinoAberto, 600);
})();

// Treino ficou aberto e a pessoa voltou ao app: pergunta se continua ou finaliza.
let saiuEm = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saiuEm = Date.now();
  else if (saiuEm && Date.now() - saiuEm > 60000) perguntarTreinoAberto();
});
function perguntarTreinoAberto() {
  const t = treinoAtivo();
  if (!t || !sessao.user || document.getElementById("folha")) return;
  const ini = t.inicio ? new Date(t.inicio) : null;
  const min = ini ? Math.round((Date.now() - ini) / 60000) : null;
  const tempo = min === null ? "" : min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
  abrirFolha(`<div class="col" style="gap:14px">
    <span class="rot ac">Treino em andamento</span>
    <h2 style="margin:0">${h(t.fichaNome || "Treino")}</h2>
    ${ini ? `<span class="peq mudo">Começou às ${ini.toTimeString().slice(0, 5)} · há ${tempo}${(t.feitas || []).length ? ` · ${t.feitas.length} séries marcadas` : ""}</span>` : ""}
    <p style="margin:0">Deseja continuar ou finalizar o treino?</p>
    <button class="btn pri blk grande" data-acao="treinoContinuar">${ico("play", 20)} Continuar treino</button>
    <button class="btn blk" data-acao="treinoFinalizar">Finalizar treino</button>
    <button class="btn blk perigo" data-acao="treinoCancelar">Cancelar treino</button></div>`, "Treino em andamento");
}
acoes.treinoContinuar = () => { fecharFolha(); if (location.hash !== "#/treino") ir("#/treino"); };
acoes.treinoCancelar = () => { fecharFolha(); acoes.cancelarTreino(); };
acoes.treinoFinalizar = () => {
  fecharFolha();
  try { sessionStorage.setItem("finalizar-ao-abrir", "1"); } catch { /* */ }
  if (location.hash === "#/treino") { sessionStorage.removeItem("finalizar-ao-abrir"); acoes.finalizar(); } else ir("#/treino");
};
// versão nova publicada: o celular procura ao abrir/voltar ao app e recarrega sozinho quando ela assume
if ("serviceWorker" in navigator) {
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tinhaControle || recarregou || location.hash.startsWith("#/treino") && document.activeElement?.matches?.("input")) return;
    recarregou = true; location.reload();
  });
}

// ---------- configuração e login ----------
function telaConfig() {
  render(`<section class="tela"><h1>Falta configurar</h1>
  <p class="mudo">Abra o arquivo <b>config.js</b> e cole a URL e a chave publishable do seu projeto Supabase. Depois publique de novo.</p></section>`);
}
function telaLogin() {
  render(`<section class="tela login">
    <div class="lg-topo">
      <span class="lg-logo" role="img" aria-label="Logo Meu Treino"></span>
      <h1>Meu Treino</h1>
      <p>Seu treino, suas cargas e sua evolução.</p>
    </div>
    <form class="lg-form" data-envia="entrar">
      <label class="lg-campo"><span>E-mail</span><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="seu@email.com" required></label>
      <label class="lg-campo"><span>Senha</span><span class="lg-senha"><input type="password" name="senha" autocomplete="current-password" minlength="6" placeholder="Sua senha" required>
        <button type="button" class="lg-ver" data-acao="verSenha" aria-label="Mostrar senha">Mostrar</button></span></label>
      <button class="btn pri blk grande" type="submit">Entrar</button>
    </form>
    <div class="lg-rodape">
      <p>Ainda não tem acesso? Fale com quem te vendeu o app.</p>
      <a href="termos.html">Termos de uso e Privacidade</a>
    </div>
  </section>`);
}
acoes.verSenha = (el) => {
  const inp = el.parentElement.querySelector("input");
  const ver = inp.type === "password"; inp.type = ver ? "text" : "password";
  el.textContent = ver ? "Esconder" : "Mostrar"; el.setAttribute("aria-label", ver ? "Esconder senha" : "Mostrar senha");
};
acoes.entrar = async (form) => {
  const f = new FormData(form);
  const bt = form.querySelector("[type=submit]"); bt.disabled = true; bt.innerHTML = '<span class="girando"></span> Entrando…';
  const { error } = await sb.auth.signInWithPassword({ email: String(f.get("email")).trim(), password: f.get("senha") });
  if (error) { toast(error.message.includes("Invalid") ? "E-mail ou senha incorretos" : error.message, 4000); bt.disabled = false; bt.textContent = "Entrar"; }
};
acoes.sair = async () => {
  const n = pendentes();
  if (n && !confirm(`Atenção: ${n} registro(s) do treino ainda não foram enviados (sem internet). Se sair agora, eles se perdem. Sair mesmo assim?`)) return;
  if (!n && !confirm("Sair da conta neste aparelho?")) return;
  await desligarLembreteDoAparelho();
  limparDadosLocais();
  salvarTreinoAtivo(null);
  await sb.auth.signOut();
};
acoes.sairDireto = async () => { limparDadosLocais(); salvarTreinoAtivo(null); await sb.auth.signOut(); };
// ao sair: apaga o que é desta conta no celular (fila, telas e treinos guardados)
function limparDadosLocais() {
  try {
    Object.keys(localStorage).filter((k) => /^(fila-envio|hoje-html-|perfil-|treino-dados|telas-)/.test(k)).forEach((k) => localStorage.removeItem(k));
  } catch { /* */ }
}
acoes.verificarDeNovo = () => { sessao.perfil = null; rota(); };

function motivoBloqueio(p) {
  if (!p) return "sem-perfil";
  if (p.papel === "admin") return null;
  if (!p.ativo) return "bloqueado";
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  if (p.acesso_ate && p.acesso_ate < hoje) return "vencido";
  return null;
}
function telaBloqueada(motivo) {
  const txt = {
    "vencido": ["Seu acesso venceu", "Renove com quem te vendeu o app. Seus treinos ficam guardados e voltam assim que o acesso for renovado."],
    "bloqueado": ["Acesso suspenso", "Fale com quem te vendeu o app para liberar. Seus treinos ficam guardados."],
    "sem-perfil": ["Conta sem acesso", "Esta conta ainda não foi liberada. Fale com quem te vendeu o app."],
  }[motivo];
  render(`<section class="tela" style="justify-content:center">
    <div class="cartao vazio"><span class="letra g">${ico("info", 28)}</span>
      <h2>${txt[0]}</h2><p style="margin:0">${txt[1]}</p>
      <span class="mini mudo">${h(sessao.user?.email || "")}</span>
      <button class="btn pri blk" data-acao="verificarDeNovo">Já renovei, verificar de novo</button>
      <button class="btn blk" data-acao="sairDireto">${ico("sair", 18)} Sair</button></div></section>`);
}

/// ---------- dados ----------
export async function carregarFichas() {
  // as duas consultas vão juntas (o servidor fica longe: cada ida e volta conta)
  const [rf, re] = await Promise.all([
    sb.from("fichas").select("*").order("ordem").order("letra"),
    sb.from("exercicios").select("id, ficha_id, nome, series, descanso_seg").eq("ativo", true),
  ]);
  const fichas = q(rf), exs = q(re);
  fichas.forEach((f) => {
    const meus = exs.filter((e) => e.ficha_id === f.id);
    f.qtd = meus.length;
    f.nomes = meus.map((e) => e.nome);
    f.series = meus.reduce((a, e) => a + (e.series || 0), 0);
    // tempo estimado: ~45 s por série + o descanso
    f.minutos = Math.round(meus.reduce((a, e) => a + (e.series || 0) * (45 + (e.descanso_seg || 60)), 0) / 60);
    // grupos musculares mais presentes na ficha
    const cont = {};
    meus.forEach((e) => { const g = grupoDe(e.nome); if (g !== "Outros") cont[g] = (cont[g] || 0) + 1; });
    f.grupos = Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 3);
    // nome automático: fichas sem nome, e todas as que não foram mexidas depois desta mudança
    // (quem editar o nome depois atualiza atualizado_em e o nome dela não é mais trocado)
    const antigas = !f.atualizado_em || f.atualizado_em < "2026-11-21T23:30:00Z";
    if (meus.length && (!(f.nome || "").trim() || antigas)) {
      const auto = nomeDoTreino(f.nomes);
      if (auto && auto !== f.nome) { f.nome = auto; sb.from("fichas").update({ nome: auto }).eq("id", f.id).then(() => {}, () => {}); }
    }
  });
  return fichas;
}
function haQuanto(iso) {
  if (!iso) return "";
  const a = new Date(iso); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const d = Math.round((b - a) / 864e5);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
}
function saudacao() {
  const hr = new Date().getHours();
  const nome = (sessao.perfil?.nome || "").trim().split(/\s+/)[0];
  return `${hr < 5 ? "Boa noite" : hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite"}${nome ? ", " + h(nome) : ""}`;
}

// ---------- HOJE ----------
async function telaHoje() {
  const ativo = treinoAtivo();
  const ini = inicioSemana();
  const [fichas, rr] = await Promise.all([
    carregarFichas(),
    sb.from("sessoes").select("id, ficha_id, inicio, fim, series_feitas(count)").order("inicio", { ascending: false }).limit(200),
  ]);
  // treino aberto e abandonado sem nenhuma série não conta
  const recentes = q(rr).filter((s) => (s.series_feitas?.[0]?.count || 0) > 0);
  const semana = recentes.filter((s) => new Date(s.inicio) >= ini);
  const ultimaPorFicha = {};
  recentes.forEach((s) => { if (s.ficha_id && !ultimaPorFicha[s.ficha_id]) ultimaPorFicha[s.ficha_id] = s.inicio; });

  // sequência de semanas seguidas com treino
  const semanas = new Set(recentes.map((s) => inicioSemana(new Date(s.inicio)).getTime()));
  let seq = 0; const cur = new Date(ini);
  if (!semanas.has(cur.getTime())) cur.setDate(cur.getDate() - 7);
  while (semanas.has(cur.getTime())) { seq++; cur.setDate(cur.getDate() - 7); }

  // próximo treino: o seguinte ao último feito nesta semana; semana nova (domingo 20h) recomeça no Treino A
  let prox = fichas.find((f) => f.letra === "A") || fichas[0];
  const iniTreino = inicioSemanaTreino();
  const ult = recentes.find((s) => s.ficha_id && new Date(s.inicio) >= iniTreino && fichas.some((f) => f.id === s.ficha_id));
  if (ult) { const i = fichas.findIndex((f) => f.id === ult.ficha_id); prox = fichas[(i + 1) % fichas.length]; }

  const nomes = ["S", "T", "Q", "Q", "S", "S", "D"];
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = nomes.map((n, i) => {
    const d = new Date(ini); d.setDate(d.getDate() + i);
    const feito = semana.find((s) => new Date(s.inicio).toDateString() === d.toDateString());
    const letra = feito ? (fichas.find((f) => f.id === feito.ficha_id)?.letra || "✓") : d.getDate();
    const cls = feito ? "feito" : d.getTime() === hoje.getTime() ? "hoje" : d > hoje ? "depois" : "";
    return `<div class="dia2 ${cls}"><span class="n">${n}</span><span class="b">${h(letra)}</span></div>`;
  }).join("");

  const iniT = inicioSemanaTreino();
  const naSemana = recentes.filter((s) => s.fim && new Date(s.inicio) >= iniT).length;
  const lista = (f, max = 5) => f.nomes.length ? h(f.nomes.slice(0, max).join(", ")) + (f.nomes.length > max ? ` +${f.nomes.length - max}` : "") : "Sem exercícios ainda";
  let destaque = "";
  if (ativo) {
    destaque = `<div class="rot-card destaque"><div class="rc-cab"><span class="letra lima">${ico("play", 18)}</span>
      <div class="rc-tit"><span class="chip ac">EM ANDAMENTO</span><b>${h(ativo.fichaNome || "Treino")}</b></div></div>
      <a class="btn pri blk" href="#/treino">${ico("play", 18)} Continuar treino</a></div>`;
  } else if (prox) {
    const ultimaVez = ultimaPorFicha[prox.id];
    destaque = `<div class="rot-card destaque"><div class="rc-cab"><span class="letra lima">${h(prox.letra)}</span>
      <div class="rc-tit"><span class="chip ac">PRÓXIMO</span><b>${h(prox.nome || "Treino " + prox.letra)}</b></div>
      <a class="ico rc-mais" href="#/ficha/${prox.id}" aria-label="Ver ficha">⋯</a></div>
      <span class="rc-lista">${lista(prox)}</span>
      <span class="rc-info">${prox.qtd} exercícios · ${prox.series} séries · ~${prox.minutos || 0} min${ultimaVez ? " · último " + haQuanto(ultimaVez) : ""}</span>
      <button class="btn pri blk grande" data-acao="iniciar" data-ficha="${prox.id}">${ico("play", 20)} Iniciar treino</button></div>`;
  } else {
    destaque = `<div class="rot-card destaque"><b style="font-size:18px">Comece pela sua ficha</b>
      <span class="rc-lista">Cole o texto do seu treino (um exercício por linha) e o app monta a ficha pra você.</span>
      <a class="btn pri blk grande" href="#/print?tipo=texto">${ico("lista", 18)} Colar meu treino</a>
      <button class="btn blk" data-acao="novaFicha">Criar ficha à mão</button></div>`;
  }
  const outras = fichas.filter((f) => ativo || !prox || f.id !== prox.id);
  const htmlHoje = (`<section class="tela">
    <div class="tela-cab"><h1>Treino</h1><span class="peq mudo">Semana: ${naSemana} de ${fichas.length || 0} treinos · zera domingo 20h</span></div>
    ${destaque}
    ${fichas.length ? `<div class="entre sec-tit"><span>MINHAS FICHAS (${fichas.length})</span><a href="#/print?tipo=texto">+ Colar treino</a></div>
      ${outras.map((f) => `<div class="rot-card"><div class="rc-cab"><span class="letra">${h(f.letra)}</span>
        <a class="rc-tit" href="#/ficha/${f.id}"><b>${h(f.nome || "Treino " + f.letra)}</b><span class="mini mudo">${ultimaPorFicha[f.id] ? "Último " + haQuanto(ultimaPorFicha[f.id]) : "Ainda não feito"}</span></a>
        <a class="ico rc-mais" href="#/ficha/${f.id}" aria-label="Ver ficha">⋯</a></div>
        <span class="rc-lista">${lista(f)}</span>
        <button class="btn blk" data-acao="iniciar" data-ficha="${f.id}" ${f.qtd ? "" : "disabled"}>${ico("play", 16)} Iniciar</button></div>`).join("")}
      <button class="btn peq" style="align-self:center" data-acao="novaFicha">${ico("mais", 16)} Criar ficha à mão</button>` : ""}
  </section>
  ${nav("#/hoje")}`);
  render(htmlHoje);
  try { localStorage.setItem(chHoje(), htmlHoje); } catch { /* */ }
  guardarParaSemInternet();
  if (prox && !ativo) carregarMidia(prox.nomes).then(() => {
    preencherMidia();
    // guarda a tela já com as fotos (para abrir sem internet)
    if (["", "#", "#/", "#/hoje"].includes(location.hash)) try { localStorage.setItem(chHoje(), document.getElementById("app").innerHTML); } catch { /* */ }
  }).catch(() => {});
}
acoes.meuNome = async () => {
  const atual = (sessao.perfil?.nome || "").trim();
  const novo = prompt("Como você quer ser chamado?", atual);
  if (novo === null || novo.trim() === atual) return;
  q(await sb.rpc("definir_meu_nome", { novo: novo.trim() }));
  if (sessao.perfil) sessao.perfil.nome = novo.trim();
  toast("Nome salvo"); ir(location.hash);
};
acoes.iniciar = async (el) => { await iniciarTreino(el.dataset.ficha); };
acoes.novaFicha = async () => {
  const fichas = q(await sb.from("fichas").select("letra, ordem"));
  const usadas = new Set(fichas.map((f) => f.letra));
  const letra = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !usadas.has(l)) || "X";
  const f = q(await sb.from("fichas").insert({ letra, nome: "", ordem: fichas.length }).select().single());
  ir(`#/ficha/${f.id}`);
};

// ---------- FICHA ----------
async function telaFicha(id) {
  const editar = new URLSearchParams(location.hash.split("?")[1] || "").get("editar") === "1";
  const [rf, re] = await Promise.all([
    sb.from("fichas").select("*").eq("id", id).single(),
    sb.from("exercicios").select("*").eq("ficha_id", id).eq("ativo", true).order("ordem"),
  ]);
  const f = q(rf), exs = q(re);
  const desenhar = (semRolar = false) => {
    // músculos alvo: soma de todos os exercícios, do mais trabalhado para o menos
    const alvo = new Map();
    exs.forEach((e) => musculosDe(e.nome).forEach((m) => { const x = alvo.get(m.nome) || { ...m, n: 0 }; x.n++; alvo.set(m.nome, x); }));
    const alvos = [...alvo.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    const series = exs.reduce((a, e) => a + (e.series || 0), 0);
    const minutos = Math.round(exs.reduce((a, e) => a + (e.series || 0) * (45 + (e.descanso_seg || 60)), 0) / 60);
    (semRolar ? renderSemRolar : render)(`<section class="tela">
    <div class="topo">${botaoVoltar(editar ? `#/ficha/${f.id}` : "#/hoje")}<div class="tit"><span class="rot ac">Treino ${h(f.letra)}</span><h2>${h(f.nome || "Treino " + f.letra)}</h2></div>
      ${editar ? "" : `<a class="ico" href="#/ficha/${f.id}?editar=1" aria-label="Editar ficha">${ico("lapis", 18)}</a>`}</div>
    ${editar ? `<div class="cartao"><div class="grade2" style="grid-template-columns:80px 1fr">
      <label class="campo">Letra<input class="inp" maxlength="3" value="${h(f.letra)}" data-muda="fichaCampo" data-id="${f.id}" data-campo="letra"></label>
      <label class="campo">Nome<input id="nomeFicha" class="inp" placeholder="Ex.: Ombro e tríceps" value="${h(f.nome)}" data-muda="fichaCampo" data-id="${f.id}" data-campo="nome"></label></div>
      ${exs.length ? `<button class="btn peq" data-acao="sugerirNome" data-id="${f.id}" data-nome="${h(nomeDoTreino(exs.map((e) => e.nome)))}">✨ Sugerir nome pelos exercícios</button>` : ""}
      <span class="mini mudo">Use as setas para mudar a ordem. Toque no exercício para editar.</span></div>` : `
    <div class="chips-linha"><span class="chip">${ico("relogio", 13, 'style="vertical-align:-2px"')} ~${minutos} min</span><span class="chip">${exs.length} exercícios</span><span class="chip">${series} séries</span>
      <span class="chip">Atualizada ${new Date(f.atualizado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span></div>
    ${alvos.length ? `<div class="col" style="gap:10px"><span class="rot">Músculos alvo</span>
      <div class="alvos">${alvos.map((m) => `<div class="alvo">${corpoSvg({ [m.grupo]: 1 }, m.costas ? "costas" : "frente")}<span>${h(m.nome)}</span></div>`).join("")}</div></div>` : ""}`}
    <div class="col" style="gap:10px"><div class="entre"><span class="rot">${exs.length} exercícios</span>${editar ? `<a class="btn peq" href="#/ficha/${f.id}">Pronto</a>` : ""}</div>
      ${exs.map((e, i) => `<div class="ex-card">
        ${editar ? `<span class="col" style="gap:2px;align-items:center"><button class="ico" style="width:32px;height:28px;border:0;background:none" data-acao="moverEx" data-id="${e.id}" data-dir="-1" aria-label="Subir"${i === 0 ? " disabled" : ""}>${ico("cima", 16)}</button>
          <button class="ico" style="width:32px;height:28px;border:0;background:none" data-acao="moverEx" data-id="${e.id}" data-dir="1" aria-label="Descer"${i === exs.length - 1 ? " disabled" : ""}>${ico("baixo", 16)}</button></span>` : ""}
        <a href="#/ex/${e.id}" class="ex-card-ft" aria-label="${h(e.nome)}">${exImg(e.nome)}${seloMusculo(e.nome)}</a>
        <a href="#/ex/${e.id}" class="col" style="flex:1;gap:4px;min-width:0;color:inherit;text-decoration:none">
          <span class="mini mudo">${i + 1} · ${h(musculosDe(e.nome).map((m) => m.nome).slice(0, 2).join(", ") || "Exercício")}</span>
          <b class="ex-card-nome">${h(e.nome)}</b>
          <span class="peq mudo">${e.series} séries • ${h(e.reps)} reps${e.carga_prevista ? " • " + kg(e.carga_prevista) : ""}</span></a>
        ${editar ? `<a href="#/ex/${e.id}" class="mudo" aria-label="Editar">${ico("lapis", 18)}</a>` : ""}</div>`).join("") || `<div class="vazio">Nenhum exercício ainda.</div>`}
      <a class="btn" href="#/ex/novo/${f.id}">${ico("mais", 18)} Adicionar exercício</a>
    </div>
    ${editar ? `<button class="btn perigo" data-acao="apagarFicha" data-id="${f.id}">${ico("lixo", 18)} Apagar ficha</button>` : ""}
  </section>
  ${editar ? "" : `<div class="rodape"><div><button class="btn pri grande" data-acao="iniciar" data-ficha="${f.id}" ${exs.length ? "" : "disabled"}>${ico("play", 20)} Iniciar treino</button></div></div>`}`);
  };
  desenhar();
  // imagens que ainda não estão no aparelho: busca e redesenha quando chegarem
  const hash = location.hash;
  if (await carregarMidia(exs.map((e) => e.nome)) && location.hash === hash) desenhar(true);
}
acoes.sugerirNome = async (el) => {
  const nome = el.dataset.nome; if (!nome) return toast("Não reconheci os exercícios para sugerir um nome");
  const inp = document.getElementById("nomeFicha"); if (inp) inp.value = nome;
  q(await sb.from("fichas").update({ nome, atualizado_em: new Date().toISOString() }).eq("id", el.dataset.id));
  toast(`Nome: ${nome}`);
};
mudancas.fichaCampo = async (el) => {
  q(await sb.from("fichas").update({ [el.dataset.campo]: el.value.trim(), atualizado_em: new Date().toISOString() }).eq("id", el.dataset.id));
  toast("Salvo");
};
acoes.moverEx = async (el) => {
  const ex = q(await sb.from("exercicios").select("id, ficha_id").eq("id", el.dataset.id).single());
  const lista = q(await sb.from("exercicios").select("id").eq("ficha_id", ex.ficha_id).eq("ativo", true).order("ordem"));
  const i = lista.findIndex((x) => x.id === ex.id), j = i + Number(el.dataset.dir);
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await Promise.all(lista.map((x, k) => sb.from("exercicios").update({ ordem: k }).eq("id", x.id)));
  telaFicha(ex.ficha_id);
};
acoes.apagarFicha = async (el) => {
  if (!confirm("Apagar esta ficha? O histórico dos treinos feitos continua guardado.")) return;
  q(await sb.from("fichas").delete().eq("id", el.dataset.id));
  toast("Ficha apagada"); ir("#/hoje");
};

// ---------- EXERCÍCIO (criar/editar) ----------
async function telaExercicio(id, fichaId) {
  const novo = id === "novo";
  const e = novo ? { nome: "", series: 3, reps: "12", carga_prevista: null, descanso_seg: 90, obs: "", ficha_id: fichaId } :
    q(await sb.from("exercicios").select("*").eq("id", id).single());
  render(`<section class="tela">
    <div class="topo">${botaoVoltar(`#/ficha/${e.ficha_id}`)}<div class="tit"><h2>${novo ? "Novo exercício" : "Editar exercício"}</h2></div></div>
    <form class="cartao" data-envia="salvarEx" data-id="${novo ? "" : e.id}" data-ficha="${e.ficha_id}">
      <label class="campo">Nome<input class="inp" name="nome" required value="${h(e.nome)}" placeholder="Ex.: Puxada frente"></label>
      <div class="grade2">
        <label class="campo">Séries<input class="inp" name="series" type="number" inputmode="numeric" min="1" max="20" value="${e.series}"></label>
        <label class="campo">Repetições<input class="inp" name="reps" value="${h(e.reps)}" placeholder="10 ou 8-12"></label>
        <label class="campo">Carga da ficha (kg)<input class="inp" name="carga" type="number" inputmode="decimal" step="0.5" value="${e.carga_prevista ?? ""}"></label>
        <label class="campo">Descanso (seg)<input class="inp" name="descanso" type="number" inputmode="numeric" step="5" value="${e.descanso_seg}"></label>
      </div>
      <label class="campo">Observação<input class="inp" name="obs" value="${h(e.obs)}" placeholder="Ex.: banco na posição 4"></label>
      <button class="btn pri blk" type="submit">Salvar</button>
      ${novo ? "" : `<a class="btn blk" href="#/equip/${e.id}?voltar=ex">${ico("imagem", 18)} Fotos e opções de equipamento</a>
      <button class="btn perigo blk" type="button" data-acao="removerEx" data-id="${e.id}" data-ficha="${e.ficha_id}">${ico("lixo", 18)} Tirar da ficha</button>`}
    </form></section>`);
}
acoes.salvarEx = async (form) => {
  const f = new FormData(form);
  const dados = {
    nome: String(f.get("nome")).trim(), series: Number(f.get("series")) || 3, reps: String(f.get("reps") || "12").trim(),
    carga_prevista: num(f.get("carga")), descanso_seg: Number(f.get("descanso")) || 90, obs: String(f.get("obs") || "").trim(),
  };
  if (form.dataset.id) q(await sb.from("exercicios").update(dados).eq("id", form.dataset.id));
  else {
    const n = q(await sb.from("exercicios").select("id").eq("ficha_id", form.dataset.ficha).eq("ativo", true)).length;
    q(await sb.from("exercicios").insert({ ...dados, ficha_id: form.dataset.ficha, ordem: n }));
  }
  q(await sb.from("fichas").update({ atualizado_em: new Date().toISOString() }).eq("id", form.dataset.ficha));
  toast("Exercício salvo"); ir(`#/ficha/${form.dataset.ficha}`);
};
acoes.removerEx = async (el) => {
  if (!confirm("Tirar este exercício da ficha? As cargas antigas continuam no histórico.")) return;
  q(await sb.from("exercicios").update({ ativo: false }).eq("id", el.dataset.id));
  toast("Removido da ficha"); ir(`#/ficha/${el.dataset.ficha}`);
};

