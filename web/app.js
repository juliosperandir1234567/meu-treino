// Meu Treino — rotas, login, tela Hoje, fichas e edição de exercícios.
import {
  sb, configOk, sessao, acoes, limpeza, mudancas, render, mostrarGuardada, esquecerTelas, ir, h, toast, erro, q, num, fmt, kg,
  dataLonga, inicioSemana, ico, botaoVoltar, nav, treinoAtivo, salvarTreinoAtivo, grupoDe,
} from "./util.js";
import { telaTreino, telaEquipamento, telaFim, telaPublicar, iniciarTreino } from "./treino.js";
import { telaPrint } from "./print.js";
import { telaEvolucao, telaAvaliacao, telaMedirCasa, telaSemana } from "./evolucao.js";
import { telaClientes, telaCliente, telaNovoCliente } from "./admin.js";
import { telaConquistas, telaPublicarSemana } from "./conquistas.js";

// ---------- cliques e mudanças (delegação) ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-acao]");
  if (!el) return;
  const f = acoes[el.dataset.acao];
  if (f) { e.preventDefault(); Promise.resolve(f(el, e)).catch((x) => erro(x)); }
});
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

async function rota() {
  if (limpeza.fn) { try { limpeza.fn(); } catch { /* */ } limpeza.fn = null; }
  if (!configOk) return telaConfig();
  if (!sessao.user) return telaLogin();
  if (!sessao.perfil || sessao.perfil.id !== sessao.user.id) {
    try { sessao.perfil = q(await sb.from("perfis").select("*").eq("id", sessao.user.id).maybeSingle()); }
    catch (e) { erro(e, "Não consegui verificar sua conta"); }
  }
  const bloqueio = motivoBloqueio(sessao.perfil);
  if (bloqueio) return telaBloqueada(bloqueio);
  mostrarGuardada();
  const [r, a, b] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const admin = sessao.perfil?.papel === "admin";
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
      case "print": return await telaPrint(params.get("tipo") || "treino");
      case "evolucao": return await telaEvolucao(params.get("aba") || "medidas", params.get("ex"));
      case "avaliacao": return await telaAvaliacao();
      case "medir": return await telaMedirCasa();
      case "semana": return await telaSemana();
      case "conquistas": return await telaConquistas();
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
    erro(e, "Erro ao abrir a tela");
    render(`<section class="tela"><div class="vazio"><p>Não consegui carregar.</p><a class="btn" href="#/hoje">Voltar ao início</a></div></section>`);
  }
}
window.addEventListener("hashchange", rota);

sb.auth.onAuthStateChange((_ev, s) => {
  const antes = sessao.user?.id;
  sessao.user = s?.user || null;
  if (antes !== sessao.user?.id) { sessao.perfil = null; esquecerTelas(); rota(); }
});
(async () => {
  if (configOk) { const { data } = await sb.auth.getSession(); sessao.user = data.session?.user || null; }
  rota();
})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- configuração e login ----------
function telaConfig() {
  render(`<section class="tela"><h1>Falta configurar</h1>
  <p class="mudo">Abra o arquivo <b>config.js</b> e cole a URL e a chave publishable do seu projeto Supabase. Depois publique de novo.</p></section>`);
}
function telaLogin() {
  render(`<section class="tela" style="justify-content:center">
    <div class="col" style="gap:6px;align-items:flex-start">
      <span class="letra g">${ico("peso", 30)}</span>
      <h1 style="margin-top:12px">Meu Treino</h1>
      <p class="mudo" style="margin:0">Seu treino, suas cargas e sua evolução.</p>
    </div>
    <form class="cartao" data-envia="entrar">
      <label class="campo">E-mail<input class="inp" type="email" name="email" autocomplete="email" required></label>
      <label class="campo">Senha<input class="inp" type="password" name="senha" autocomplete="current-password" minlength="6" required></label>
      <button class="btn pri blk" type="submit">Entrar</button>
    </form>
    <p class="mini mudo" style="margin:0;text-align:center">Ainda não tem acesso? Fale com quem te vendeu o app.</p></section>`);
}
acoes.entrar = async (form) => {
  const f = new FormData(form);
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("senha") });
  if (error) toast(error.message.includes("Invalid") ? "E-mail ou senha incorretos" : error.message, 4000);
};
acoes.sair = async () => {
  if (!confirm("Sair da conta neste aparelho?")) return;
  salvarTreinoAtivo(null);
  await sb.auth.signOut();
};
acoes.sairDireto = async () => { salvarTreinoAtivo(null); await sb.auth.signOut(); };
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
    f.series = meus.reduce((a, e) => a + (e.series || 0), 0);
    // tempo estimado: ~45 s por série + o descanso
    f.minutos = Math.round(meus.reduce((a, e) => a + (e.series || 0) * (45 + (e.descanso_seg || 60)), 0) / 60);
    // grupos musculares mais presentes na ficha
    const cont = {};
    meus.forEach((e) => { const g = grupoDe(e.nome); if (g !== "Outros") cont[g] = (cont[g] || 0) + 1; });
    f.grupos = Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 3);
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
    sb.from("sessoes").select("id, ficha_id, inicio, fim").order("inicio", { ascending: false }).limit(200),
  ]);
  const recentes = q(rr);
  const semana = recentes.filter((s) => new Date(s.inicio) >= ini);
  const ultimaPorFicha = {};
  recentes.forEach((s) => { if (s.ficha_id && !ultimaPorFicha[s.ficha_id]) ultimaPorFicha[s.ficha_id] = s.inicio; });

  // sequência de semanas seguidas com treino
  const semanas = new Set(recentes.map((s) => inicioSemana(new Date(s.inicio)).getTime()));
  let seq = 0; const cur = new Date(ini);
  if (!semanas.has(cur.getTime())) cur.setDate(cur.getDate() - 7);
  while (semanas.has(cur.getTime())) { seq++; cur.setDate(cur.getDate() - 7); }

  // próximo treino: o seguinte ao último feito, na ordem da ficha
  let prox = fichas[0];
  const ult = recentes.find((s) => s.ficha_id && fichas.some((f) => f.id === s.ficha_id));
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

  const chipsGrupo = (f) => f.grupos.map((g) => `<span class="chip">${h(g)}</span>`).join("");
  let destaque;
  if (ativo) {
    destaque = `<div class="heroi"><span class="rot ac">Treino em andamento</span>
      <h2 class="heroi-tit">${h(ativo.fichaNome || "Treino")}</h2>
      <a class="btn pri blk grande" href="#/treino">${ico("play", 20)} Continuar treino</a></div>`;
  } else if (prox) {
    const ultimaVez = ultimaPorFicha[prox.id];
    destaque = `<div class="heroi">
      <div class="entre"><span class="rot ac">Treino de hoje</span><span class="mini mudo">${ultimaVez ? "Último: " + haQuanto(ultimaVez) : "Ainda não feito"}</span></div>
      <div class="linha" style="gap:16px;align-items:center"><span class="letra xg">${h(prox.letra)}</span>
        <div class="col" style="gap:6px;min-width:0"><h2 class="heroi-tit">${h(prox.nome || "Treino " + prox.letra)}</h2>
        ${prox.grupos.length ? `<div class="linha" style="gap:6px;flex-wrap:wrap">${chipsGrupo(prox)}</div>` : ""}</div></div>
      <div class="heroi-num">
        <div><b>${prox.qtd}</b><span>exercícios</span></div>
        <div><b>${prox.series}</b><span>séries</span></div>
        <div><b>~${prox.minutos || 0}</b><span>minutos</span></div></div>
      <button class="btn pri blk grande" data-acao="iniciar" data-ficha="${prox.id}">${ico("play", 20)} Iniciar treino</button>
      <a class="mini mudo" style="text-align:center;text-decoration:none" href="#/ficha/${prox.id}">Ver a ficha completa ›</a></div>`;
  } else {
    destaque = `<div class="heroi vazio"><span class="letra xg">${ico("camera", 30)}</span>
      <h2>Comece pelo print</h2><p class="mudo" style="margin:0">Tire um print do seu treino no app da academia e mande aqui. Eu monto a ficha pra você.</p>
      <a class="btn pri blk grande" href="#/print">${ico("camera", 18)} Mandar print</a>
      <button class="btn blk" data-acao="novaFicha">Criar ficha à mão</button></div>`;
  }

  render(`<section class="tela">
    <div class="entre"><div class="col" style="gap:4px"><span class="peq mudo">${dataLonga()}</span><h1>${saudacao()}</h1></div>
      <button class="ico" data-acao="sair" aria-label="Sair da conta">${ico("sair")}</button></div>
    ${destaque}
    <a class="cartao semana-cartao" href="#/semana">
      <div class="entre"><b>Esta semana</b><span class="linha" style="gap:8px">
        <span class="chip">${semana.length} treino${semana.length === 1 ? "" : "s"}</span>
        ${seq ? `<span class="chip lar">${ico("fogo", 13, 'style="vertical-align:-2px"')} ${seq} sem. seguida${seq === 1 ? "" : "s"}</span>` : ""}</span></div>
      <div class="semana2">${dias}</div></a>
    ${fichas.length ? `<div class="col"><div class="entre"><h3>Minhas fichas</h3><button class="btn peq" data-acao="novaFicha">${ico("mais", 16)} Nova</button></div>
      ${fichas.map((f) => `<a class="item ficha-item ${prox && f.id === prox.id && !ativo ? "prox" : ""}" href="#/ficha/${f.id}"><span class="letra">${h(f.letra)}</span>
        <span class="col" style="flex:1;gap:3px;min-width:0"><b>${h(f.nome || "Treino " + f.letra)}</b>
        <span class="mini mudo">${f.grupos.length ? h(f.grupos.join(" · ")) + " · " : ""}${f.qtd} exercícios</span></span>
        <span class="col" style="align-items:flex-end;gap:3px">${prox && f.id === prox.id && !ativo ? `<span class="chip ac">Próximo</span>` : ""}<span class="mini mudo">${ultimaPorFicha[f.id] ? haQuanto(ultimaPorFicha[f.id]) : "—"}</span></span></a>`).join("")}
      <a class="item tracejado" href="#/print"><span class="letra">${ico("camera", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Atualizar por print</b><span class="mini mudo">Mandou ficha nova na academia? Envie o print</span></span><span class="mudo">${ico("seta", 18)}</span></a></div>` : ""}
  </section>
  ${nav("#/hoje")}`);
}
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
  const f = q(await sb.from("fichas").select("*").eq("id", id).single());
  const exs = q(await sb.from("exercicios").select("*").eq("ficha_id", id).eq("ativo", true).order("ordem"));
  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/hoje")}<div class="tit"><h2>Treino ${h(f.letra)}${f.nome ? " · " + h(f.nome) : ""}</h2>
      <span class="mini mudo">${exs.length} exercícios · atualizado em ${new Date(f.atualizado_em).toLocaleDateString("pt-BR")}</span></div></div>
    <div class="cartao"><div class="grade2" style="grid-template-columns:80px 1fr">
      <label class="campo">Letra<input class="inp" maxlength="3" value="${h(f.letra)}" data-muda="fichaCampo" data-id="${f.id}" data-campo="letra"></label>
      <label class="campo">Nome<input class="inp" placeholder="Ex.: Ombro e tríceps" value="${h(f.nome)}" data-muda="fichaCampo" data-id="${f.id}" data-campo="nome"></label></div></div>
    <div class="col">
      ${exs.map((e, i) => `<div class="item">
        <span class="col" style="gap:2px;align-items:center"><button class="ico" style="width:32px;height:28px;border:0;background:none" data-acao="moverEx" data-id="${e.id}" data-dir="-1" aria-label="Subir"${i === 0 ? " disabled" : ""}>${ico("cima", 16)}</button>
        <button class="ico" style="width:32px;height:28px;border:0;background:none" data-acao="moverEx" data-id="${e.id}" data-dir="1" aria-label="Descer"${i === exs.length - 1 ? " disabled" : ""}>${ico("baixo", 16)}</button></span>
        <a href="#/ex/${e.id}" class="col" style="flex:1;gap:2px;color:inherit;text-decoration:none"><b>${h(e.nome)}</b>
        <span class="mini mudo">${e.series} × ${h(e.reps)}${e.carga_prevista ? " · " + kg(e.carga_prevista) : ""} · descanso ${e.descanso_seg}s</span></a>
        <a href="#/ex/${e.id}" class="mudo" aria-label="Editar">${ico("lapis", 18)}</a></div>`).join("") || `<div class="vazio">Nenhum exercício ainda.</div>`}
      <a class="btn" href="#/ex/novo/${f.id}">${ico("mais", 18)} Adicionar exercício</a>
    </div>
    <button class="btn perigo" data-acao="apagarFicha" data-id="${f.id}">${ico("lixo", 18)} Apagar ficha</button>
  </section>
  <div class="rodape"><div><button class="btn pri" data-acao="iniciar" data-ficha="${f.id}" ${exs.length ? "" : "disabled"}>${ico("play", 18)} Iniciar este treino</button></div></div>`);
}
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

