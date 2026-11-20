// Perfil: foto, nome, acesso e números de quem treina. Para o admin, atalho para o painel de clientes.
import { sb, sessao, acoes, render, h, q, fmt, toast, ico, nav, fotoUrl, reduzir, enviarFoto, escolherFoto } from "./util.js";
import { volumeTxt } from "./treino.js";

export function iniciais(nome, email) {
  const base = (nome || "").trim() || (email || "").split("@")[0];
  const p = base.split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
// avatar redondo: foto se tiver, senão as iniciais
export async function avatarHtml(tam = 44) {
  const p = sessao.perfil || {};
  const url = p.foto_path ? await fotoUrl(p.foto_path) : null;
  return url ? `<img class="avatar" style="width:${tam}px;height:${tam}px" src="${h(url)}" alt="">`
    : `<span class="avatar" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.38)}px">${h(iniciais(p.nome, sessao.user?.email))}</span>`;
}

export async function telaPerfil() {
  const p = sessao.perfil || {};
  const [av, est] = await Promise.all([avatarHtml(112), sb.rpc("minhas_estatisticas").then((r) => r.data || {}, () => ({}))]);
  const admin = p.papel === "admin";
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dias = p.acesso_ate ? Math.round((new Date(p.acesso_ate + "T12:00") - new Date(hoje + "T12:00")) / 864e5) : null;
  const acesso = admin ? `<span class="chip ac">Administrador</span>`
    : p.acesso_ate ? `<span class="chip ${dias <= 5 ? "lar" : ""}">Acesso até ${new Date(p.acesso_ate + "T12:00").toLocaleDateString("pt-BR")}${dias <= 5 ? ` · ${dias <= 0 ? "vence hoje" : `faltam ${dias} dia${dias === 1 ? "" : "s"}`}` : ""}</span>`
    : `<span class="chip ac">Acesso liberado</span>`;
  render(`<section class="tela">
    <div class="perfil-topo">
      <button class="perfil-foto" data-acao="minhaFoto" aria-label="Trocar foto de perfil">${av}<span class="perfil-cam">${ico("camera", 16)}</span></button>
      <button class="nome-btn" data-acao="meuNome" aria-label="Trocar meu nome"><h1 style="text-align:center">${h((p.nome || "").trim() || "Seu nome")}</h1></button>
      <span class="peq mudo">${h(sessao.user?.email || "")}</span>
      ${acesso}
    </div>
    <div class="grade3"><div class="stat"><span class="mini mudo">Treinos</span><span class="v">${Number(est.treinos) || 0}</span></div>
      <div class="stat"><span class="mini mudo">Volume total</span><span class="v">${volumeTxt(Number(est.volume) || 0)}</span></div>
      <div class="stat"><span class="mini mudo">Maior carga</span><span class="v">${est.carga_max ? fmt(est.carga_max) + " kg" : "—"}</span></div></div>
    <div class="col" style="gap:8px">
      <a class="item" href="#/conquistas"><span class="letra">🏆</span><span class="col" style="flex:1;gap:2px"><b>Calendário e conquistas</b><span class="mini mudo">Seus dias de treino e medalhas</span></span><span class="mudo">${ico("seta", 18)}</span></a>
      <button class="item" data-acao="meuNome"><span class="letra">${ico("lapis", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Trocar meu nome</b><span class="mini mudo">Como você aparece no app</span></span><span class="mudo">${ico("seta", 18)}</span></button>
      ${admin ? `<a class="item" href="#/clientes"><span class="letra g" style="width:40px;height:40px;font-size:18px">${ico("chave", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Painel de clientes</b><span class="mini mudo">Criar contas, renovar e bloquear acesso</span></span><span class="mudo">${ico("seta", 18)}</span></a>` : ""}
      <button class="item" data-acao="sair"><span class="letra">${ico("sair", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Sair da conta</b><span class="mini mudo">Neste aparelho</span></span></button>
    </div>
  </section>${nav("#/perfil")}`);
}

acoes.minhaFoto = async () => {
  const file = await escolherFoto();
  if (!file) return;
  toast("Enviando foto…");
  const path = await enviarFoto(await reduzir(file, 600, 0.85), "perfil");
  q(await sb.rpc("definir_minha_foto", { caminho: path }));
  if (sessao.perfil) sessao.perfil.foto_path = path;
  toast("Foto salva");
  telaPerfil();
};
