// Painel do administrador: clientes e acesso. Não mostra treinos de ninguém.
import { sb, sessao, acoes, render, ir, h, toast, erro, ico, botaoVoltar, nav, hora } from "./util.js";

async function chamar(corpo) {
  const { data, error } = await sb.functions.invoke("admin", { body: corpo });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json(); if (j?.erro) msg = j.erro; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dataBR = (iso) => iso ? iso.split("-").reverse().join("/") : "";
function somaDias(iso, dias) {
  const d = new Date(`${iso || hojeISO()}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function situacao(c) {
  if (c.papel === "admin") return { txt: "Admin", cls: "ac" };
  if (!c.ativo) return { txt: "Bloqueado", cls: "" };
  if (c.acesso_ate && c.acesso_ate < hojeISO()) return { txt: "Vencido", cls: "lar" };
  if (c.acesso_ate) {
    const dias = Math.round((new Date(`${c.acesso_ate}T12:00:00`) - new Date(`${hojeISO()}T12:00:00`)) / 864e5);
    if (dias <= 5) return { txt: dias === 0 ? "Vence hoje" : `Vence em ${dias}d`, cls: "lar" };
    return { txt: `Até ${dataBR(c.acesso_ate)}`, cls: "ac" };
  }
  return { txt: "Ativo", cls: "ac" };
}
function quando(iso) {
  if (!iso) return "nunca entrou";
  const d = new Date(iso);
  return `último acesso ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora(iso)}`;
}
function senhaAleatoria() {
  const c = "abcdefghjkmnpqrstuvwxyz23456789";
  const a = crypto.getRandomValues(new Uint8Array(8));
  return [...a].map((x) => c[x % c.length]).join("");
}

let cache = [];

// ---------- lista ----------
export async function telaClientes() {
  render(`<section class="tela"><h1>Clientes</h1><div class="carregando" style="padding:40px 0"><div class="girando" style="margin:auto"></div></div></section>${nav("#/clientes")}`);
  cache = (await chamar({ acao: "listar" })).clientes;
  const clientes = cache.filter((c) => c.papel !== "admin");
  const hoje = hojeISO();
  const ativos = clientes.filter((c) => c.ativo && (!c.acesso_ate || c.acesso_ate >= hoje)).length;
  const vencendo = clientes.filter((c) => c.ativo && c.acesso_ate && c.acesso_ate >= hoje && c.acesso_ate <= somaDias(hoje, 5)).length;
  render(`<section class="tela">
    <div class="entre"><h1>Clientes</h1><a class="btn peq pri" href="#/cliente/novo">${ico("mais", 16)} Novo</a></div>
    <div class="grade3">
      <div class="stat"><span class="mini mudo">Total</span><span class="v">${clientes.length}</span></div>
      <div class="stat"><span class="mini mudo">Com acesso</span><span class="v ac">${ativos}</span></div>
      <div class="stat"><span class="mini mudo">Vencendo</span><span class="v ${vencendo ? "lar" : ""}">${vencendo}</span></div>
    </div>
    ${clientes.length ? `<input class="inp" type="search" placeholder="Buscar por nome ou e-mail" oninput="window.__filtrarClientes(this.value)">` : ""}
    <div class="col" id="lista-clientes">
      ${clientes.map((c) => { const s = situacao(c); return `<a class="item" href="#/cliente/${c.id}" data-busca="${h((c.nome + " " + c.email).toLowerCase())}">
        <span class="letra">${h((c.nome || c.email).charAt(0).toUpperCase())}</span>
        <span class="col" style="flex:1;gap:2px;min-width:0"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(c.nome || c.email)}</b>
        <span class="mini mudo" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.nome ? h(c.email) + " · " : ""}${quando(c.ultimo_acesso)}</span></span>
        <span class="chip ${s.cls}">${s.txt}</span></a>`; }).join("") ||
        `<div class="cartao vazio"><span class="letra g">${ico("pessoa", 28)}</span><h2>Nenhum cliente ainda</h2>
         <p style="margin:0">Crie a conta do seu primeiro cliente e envie o e-mail e a senha para ele.</p>
         <a class="btn pri blk" href="#/cliente/novo">${ico("mais", 18)} Novo cliente</a></div>`}
    </div>
  </section>${nav("#/clientes")}`);
}
window.__filtrarClientes = (t) => {
  const v = t.trim().toLowerCase();
  document.querySelectorAll("#lista-clientes [data-busca]").forEach((el) => { el.style.display = el.dataset.busca.includes(v) ? "" : "none"; });
};

// ---------- novo ----------
export function telaNovoCliente() {
  const senha = senhaAleatoria();
  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/clientes")}<div class="tit"><h2>Novo cliente</h2></div></div>
    <form class="cartao" data-envia="criarCliente">
      <label class="campo">Nome<input class="inp" name="nome" autocomplete="off" placeholder="Ex.: Maria Silva"></label>
      <label class="campo">E-mail<input class="inp" name="email" type="email" required autocomplete="off" inputmode="email"></label>
      <label class="campo">Senha provisória<input class="inp" name="senha" required minlength="6" value="${senha}" autocomplete="off"></label>
      <label class="campo">Acesso até <span class="mini">(deixe vazio para não vencer)</span>
        <input class="inp" name="acesso_ate" type="date" value="${somaDias(hojeISO(), 30)}"></label>
      <div class="linha" style="flex-wrap:wrap;gap:6px">
        ${[["+7 dias", 7], ["+30 dias", 30], ["+1 ano", 365]].map(([t, d]) => `<button type="button" class="chip" data-acao="prazoNovo" data-d="${d}">${t}</button>`).join("")}
        <button type="button" class="chip" data-acao="prazoNovo" data-d="0">Sem vencimento</button>
      </div>
      <button class="btn pri blk" type="submit">Criar conta</button>
    </form>
    <p class="mini mudo" style="margin:0">A conta já nasce liberada. Depois de criar, você copia os dados de acesso para mandar ao cliente.</p>
  </section>`);
}
acoes.prazoNovo = (el) => {
  const inp = document.querySelector('form[data-envia="criarCliente"] [name="acesso_ate"]');
  inp.value = Number(el.dataset.d) ? somaDias(hojeISO(), Number(el.dataset.d)) : "";
};
acoes.criarCliente = async (form) => {
  const f = new FormData(form);
  const btn = form.querySelector('[type="submit"]'); btn.disabled = true; btn.textContent = "Criando…";
  try {
    const dados = { nome: String(f.get("nome")).trim(), email: String(f.get("email")).trim(), senha: String(f.get("senha")), acesso_ate: f.get("acesso_ate") || null };
    const r = await chamar({ acao: "criar", ...dados });
    telaAcessoCriado(dados, r.id);
  } catch (e) { erro(e, "Não criei"); btn.disabled = false; btn.textContent = "Criar conta"; }
};
function textoAcesso(d) {
  return `Olá${d.nome ? " " + d.nome.split(" ")[0] : ""}! Seu acesso ao Meu Treino:\n\n${location.origin}\nE-mail: ${d.email}\nSenha: ${d.senha}\n\nNo iPhone, abra no Safari e toque em Compartilhar → Adicionar à Tela de Início.`;
}
function telaAcessoCriado(d, id) {
  const txt = textoAcesso(d);
  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/clientes")}<div class="tit"><h2>Conta criada</h2></div></div>
    <div class="cartao ac-borda"><span class="rot ac">Mande para o cliente</span>
      <pre style="white-space:pre-wrap;margin:0;font:inherit;font-size:14px">${h(txt)}</pre>
      <button class="btn pri blk" data-acao="copiarAcesso">${ico("check", 18)} Copiar mensagem</button>
      <a class="btn blk" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
    </div>
    <a class="btn blk" href="#/cliente/${id}">Ver cliente</a>
  </section>`);
  acoes.copiarAcesso = async () => { try { await navigator.clipboard.writeText(txt); toast("Copiado"); } catch { toast("Não consegui copiar; selecione o texto"); } };
}

// ---------- detalhe ----------
export async function telaCliente(id) {
  if (!cache.length || !cache.find((c) => c.id === id)) cache = (await chamar({ acao: "listar" })).clientes;
  const c = cache.find((x) => x.id === id);
  if (!c) { toast("Cliente não encontrado"); return ir("#/clientes"); }
  const s = situacao(c);
  const souEu = c.id === sessao.user.id;
  render(`<section class="tela">
    <div class="topo">${botaoVoltar("#/clientes")}<div class="tit"><h2 style="overflow:hidden;text-overflow:ellipsis">${h(c.nome || c.email)}</h2>
      <span class="mini mudo">${h(c.email)}</span></div><span class="chip ${s.cls}">${s.txt}</span></div>
    <div class="grade2">
      <div class="stat"><span class="mini mudo">Cliente desde</span><span class="v" style="font-size:17px">${new Date(c.criado_em).toLocaleDateString("pt-BR")}</span></div>
      <div class="stat"><span class="mini mudo">Último acesso</span><span class="v" style="font-size:17px">${c.ultimo_acesso ? new Date(c.ultimo_acesso).toLocaleDateString("pt-BR") : "—"}</span></div>
    </div>
    <form class="cartao" data-envia="salvarCliente" data-id="${c.id}">
      <label class="campo">Nome<input class="inp" name="nome" value="${h(c.nome)}"></label>
      ${souEu ? "" : `<label class="campo">Acesso até <span class="mini">(vazio = não vence)</span><input class="inp" name="acesso_ate" type="date" value="${c.acesso_ate || ""}"></label>
      <div class="linha" style="flex-wrap:wrap;gap:6px">
        ${[["+7 dias", 7], ["+30 dias", 30], ["+1 ano", 365]].map(([t, d]) => `<button type="button" class="chip" data-acao="renovar" data-d="${d}">${t}</button>`).join("")}
        <button type="button" class="chip" data-acao="renovar" data-d="0">Sem vencimento</button>
      </div>`}
      <button class="btn pri blk" type="submit">Salvar</button>
    </form>
    ${souEu ? `<p class="mini mudo" style="margin:0">Esta é a sua conta de administrador.</p>` : `
    <div class="col">
      <button class="btn blk" data-acao="alternarCliente" data-id="${c.id}" data-ativo="${c.ativo}">${c.ativo ? "Bloquear acesso" : "Liberar acesso"}</button>
      <button class="btn blk" data-acao="novaSenhaCliente" data-id="${c.id}">Definir nova senha</button>
      <button class="btn perigo blk" data-acao="apagarCliente" data-id="${c.id}">${ico("lixo", 18)} Apagar conta e dados</button>
    </div>`}
  </section>`);
}
acoes.renovar = (el) => {
  const inp = document.querySelector('form[data-envia="salvarCliente"] [name="acesso_ate"]');
  const d = Number(el.dataset.d);
  if (!d) { inp.value = ""; return; }
  // renova a partir do vencimento atual, se ainda não venceu; senão a partir de hoje
  const base = inp.value && inp.value >= hojeISO() ? inp.value : hojeISO();
  inp.value = somaDias(base, d);
};
acoes.salvarCliente = async (form) => {
  const f = new FormData(form);
  const corpo = { acao: "atualizar", id: form.dataset.id, nome: String(f.get("nome")).trim() };
  if (f.has("acesso_ate")) corpo.acesso_ate = f.get("acesso_ate") || null;
  await chamar(corpo);
  cache = []; toast("Salvo"); telaCliente(form.dataset.id);
};
acoes.alternarCliente = async (el) => {
  const bloquear = el.dataset.ativo === "true";
  if (bloquear && !confirm("Bloquear este cliente? Ele não vai conseguir usar o app até você liberar de novo. Os dados dele ficam guardados.")) return;
  await chamar({ acao: "atualizar", id: el.dataset.id, ativo: !bloquear });
  cache = []; toast(bloquear ? "Bloqueado" : "Liberado"); telaCliente(el.dataset.id);
};
acoes.novaSenhaCliente = async (el) => {
  const senha = prompt("Nova senha (mínimo 6 caracteres):", senhaAleatoria());
  if (senha === null) return;
  if (senha.length < 6) return toast("A senha precisa ter pelo menos 6 caracteres");
  await chamar({ acao: "senha", id: el.dataset.id, senha });
  const c = cache.find((x) => x.id === el.dataset.id) || {};
  telaAcessoCriado({ nome: c.nome || "", email: c.email || "", senha }, el.dataset.id);
};
acoes.apagarCliente = async (el) => {
  const c = cache.find((x) => x.id === el.dataset.id) || {};
  const conf = prompt(`Isso apaga a conta e TODOS os treinos e fotos de ${c.email}. Não tem volta.\n\nPara confirmar, digite APAGAR:`);
  if (conf === null) return;
  if (conf.trim().toUpperCase() !== "APAGAR") return toast("Não apaguei");
  await chamar({ acao: "apagar", id: el.dataset.id });
  cache = []; toast("Conta apagada"); ir("#/clientes");
};
