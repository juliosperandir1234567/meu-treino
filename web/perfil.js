// Perfil: foto, nome, acesso e números de quem treina. Para o admin, atalho para o painel de clientes.
import { sb, sessao, acoes, render, h, q, fmt, toast, ico, nav, fotoUrl, reduzir, enviarFoto, escolherFoto } from "./util.js";

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

// Semana de treino: de domingo 20h até o domingo seguinte 20h
function inicioSemanaTreino(d = new Date()) {
  const x = new Date(d); x.setHours(20, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());          // domingo desta semana, 20h
  if (x > d) x.setDate(x.getDate() - 7);        // ainda não deu domingo 20h: começou no domingo anterior
  return x;
}
const kgBR = (v) => Math.round(Number(v) || 0).toLocaleString("pt-BR") + " kg";
const valorStat = (v) => `<span class="v" style="white-space:nowrap;${v.length > 9 ? "font-size:16px" : v.length > 7 ? "font-size:18px" : ""}">${v}</span>`;
// séries das últimas 8 semanas, agrupadas por semana (a primeira é a atual).
// Só conta treino finalizado: treino em andamento ou largado no meio não entra.
async function semanasDeTreino() {
  const agora = new Date(), ini = inicioSemanaTreino(agora);
  const desde = new Date(ini); desde.setDate(desde.getDate() - 7 * 7);
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const r = q(await sb.from("series_feitas").select("sessao_id, carga, reps, feita_em, sessoes!inner(fim)").not("sessoes.fim", "is", null).gte("feita_em", desde.toISOString()).order("feita_em").range(de, de + 999));
    linhas.push(...r); if (r.length < 1000) break;
  }
  const hoje = agora.toDateString();
  const semanas = [];
  for (let i = 0; i < 8; i++) {
    const a = new Date(ini); a.setDate(a.getDate() - 7 * i);
    const b = new Date(a); b.setDate(b.getDate() + 7);
    const xs = linhas.filter((l) => { const t = new Date(l.feita_em); return t >= a && t < b; });
    const sess = new Set(xs.map((l) => l.sessao_id));
    const sessHoje = new Set(xs.filter((l) => new Date(l.feita_em).toDateString() === hoje).map((l) => l.sessao_id));
    const fimTxt = b;
    const dm = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    semanas.push({
      treinos: sess.size, hoje: sessHoje.size,
      peso: xs.reduce((s, l) => s + (Number(l.carga) || 0) * (Number(l.reps) || 0), 0),
      maior: Math.max(0, ...xs.map((l) => Number(l.carga) || 0)),
      rotulo: `${dm(a)} a ${dm(fimTxt)}`,
    });
  }
  return semanas;
}

export async function telaPerfil() {
  const p = sessao.perfil || {};
  const [av, semanas] = await Promise.all([avatarHtml(112), semanasDeTreino().catch(() => null)]);
  const atual = semanas?.[0] || { treinos: 0, hoje: 0, peso: 0, maior: 0 };
  const anteriores = (semanas || []).slice(1).filter((s) => s.treinos);
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
    <div class="col" style="gap:8px">
      <div class="entre"><span class="rot">Esta semana</span><span class="mini mudo">zera domingo às 20h</span></div>
      <div class="grade3 stats-centro">
        <div class="stat"><span class="mini mudo">Treinos</span><span class="v">${semanas ? atual.treinos : "—"}</span><span class="mini mudo">${atual.hoje ? `${atual.hoje} hoje` : "nenhum hoje"}</span></div>
        <div class="stat"><span class="mini mudo">Peso total</span>${valorStat(semanas ? kgBR(atual.peso) : "—")}<span class="mini mudo">carga × reps</span></div>
        <div class="stat"><span class="mini mudo">Maior carga</span>${valorStat(atual.maior ? fmt(atual.maior) + " kg" : "—")}<span class="mini mudo">na semana</span></div></div>
      ${anteriores.length ? `<details class="cartao hist-sem"><summary><b>Semanas anteriores</b><span class="mini mudo">${anteriores.length}</span></summary>
        <div class="col" style="gap:0;margin-top:8px">${anteriores.map((s) => `<div class="entre hist-sem-l"><span class="peq">${s.rotulo}</span>
          <span class="peq mudo" style="text-align:right">${s.treinos} treino${s.treinos > 1 ? "s" : ""} · ${kgBR(s.peso)} · máx ${fmt(s.maior)} kg</span></div>`).join("")}</div></details>` : ""}
    </div>
    <div class="col" style="gap:8px">
      <a class="item" href="#/conquistas"><span class="letra">🏆</span><span class="col" style="flex:1;gap:2px"><b>Calendário e conquistas</b><span class="mini mudo">Seus dias de treino e medalhas</span></span><span class="mudo">${ico("seta", 18)}</span></a>
      <a class="item" href="#/lembrete"><span class="letra">${ico("sino", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Lembrete de treino</b><span class="mini mudo">Aviso no celular nos seus dias de treino</span></span><span class="mudo">${ico("seta", 18)}</span></a>
      <button class="item" data-acao="meuNome"><span class="letra">${ico("lapis", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Trocar meu nome</b><span class="mini mudo">Como você aparece no app</span></span><span class="mudo">${ico("seta", 18)}</span></button>
      ${admin ? `<a class="item" href="#/clientes"><span class="letra g" style="width:40px;height:40px;font-size:18px">${ico("chave", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Painel de clientes</b><span class="mini mudo">Criar contas, renovar e bloquear acesso</span></span><span class="mudo">${ico("seta", 18)}</span></a>` : ""}
      <a class="item" href="termos.html"><span class="letra">${ico("info", 18)}</span><span class="col" style="flex:1;gap:2px"><b>Termos e privacidade</b><span class="mini mudo">Como seus dados são usados</span></span><span class="mudo">${ico("seta", 18)}</span></a>
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
