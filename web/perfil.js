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

// cartão de um treino feito (estilo "feed"): duração, séries, exercícios e botão para pôr foto/publicar
export function cartaoTreinoFeito(s, av) {
  const ser = s.series_feitas || [];
  const porEx = new Map(); ser.forEach((x) => porEx.set(x.exercicio_nome, (porEx.get(x.exercicio_nome) || 0) + 1));
  const exs = [...porEx.entries()];
  const ini = new Date(s.inicio);
  const dia = ini.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const min = s.fim ? Math.round((new Date(s.fim) - ini) / 60000) : null;
  const dur = min === null ? "—" : min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
  return `<div class="feed-card">
    <a class="fc-cab" href="#/fim/${s.id}"><span class="fc-av">${av}</span><span class="col" style="gap:1px;min-width:0"><b>${h(s.ficha_nome || "Treino")}</b>
      <span class="mini mudo">${dia.charAt(0).toUpperCase() + dia.slice(1)} · ${ini.toTimeString().slice(0, 5)}</span></span></a>
    <div class="fc-st"><div><span>Duração</span><b>${dur}</b></div><div><span>Séries</span><b>${ser.length}</b></div><div><span>Exercícios</span><b>${exs.length}</b></div></div>
    <div class="fc-ex">${exs.slice(0, 3).map(([n, q]) => `<span><i>${q}×</i> ${h(n)}</span>`).join("")}${exs.length > 3 ? `<span class="mini mudo">+ ${exs.length - 3} exercício${exs.length - 3 > 1 ? "s" : ""}</span>` : ""}</div>
    <a class="btn blk" href="#/fim/${s.id}">${ico("camera", 16)} ${s.foto_path ? "Ver foto e publicar" : "Foto e publicar"}</a>
  </div>`;
}

export async function telaPerfil() {
  const p = sessao.perfil || {};
  const [av, avP, semanas, est, feitos] = await Promise.all([
    avatarHtml(76), avatarHtml(38), semanasDeTreino().catch(() => null),
    sb.rpc("minhas_estatisticas").then((r) => r.data || {}, () => ({})),
    sb.from("sessoes").select("id, ficha_nome, inicio, fim, foto_path, series_feitas(exercicio_nome)").not("fim", "is", null)
      .order("inicio", { ascending: false }).limit(6).then((r) => (r.data || []).filter((s) => s.series_feitas?.length), () => []),
  ]);
  const atual = semanas?.[0] || { treinos: 0, hoje: 0, peso: 0, maior: 0 };
  const anteriores = (semanas || []).slice(1).filter((s) => s.treinos);
  const admin = p.papel === "admin";
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dias = p.acesso_ate ? Math.round((new Date(p.acesso_ate + "T12:00") - new Date(hoje + "T12:00")) / 864e5) : null;
  const acesso = admin ? "Administrador"
    : p.acesso_ate ? `Acesso até ${new Date(p.acesso_ate + "T12:00").toLocaleDateString("pt-BR")}${dias <= 5 ? ` · ${dias <= 0 ? "vence hoje" : `faltam ${dias} dia${dias === 1 ? "" : "s"}`}` : ""}`
    : "Acesso liberado";
  const item = (href, icone, tit, sub, extra = "") => `<${href ? `a href="${href}"` : `button ${extra}`} class="menu-item"><span class="mi-ic">${icone}</span><span class="col" style="flex:1;gap:1px;min-width:0"><b>${tit}</b>${sub ? `<span class="mini mudo">${sub}</span>` : ""}</span><span class="mudo">${ico("seta", 16)}</span></${href ? "a" : "button"}>`;
  render(`<section class="tela">
    <div class="perfil-cab">
      <div class="linha" style="gap:14px">
        <button class="perfil-foto" data-acao="minhaFoto" aria-label="Trocar foto de perfil">${av}<span class="perfil-cam">${ico("camera", 14)}</span></button>
        <div class="col" style="gap:2px;min-width:0;flex:1"><button class="nome-btn" data-acao="meuNome" aria-label="Trocar meu nome"><h2 style="margin:0">${h((p.nome || "").trim() || "Seu nome")}</h2></button>
          <span class="mini ${!admin && dias !== null && dias <= 5 ? "lar" : "mudo"}">${acesso}</span></div>
      </div>
      <div class="pc-nums">
        <div><b>${Number(est.treinos) || 0}</b><span>treinos</span></div>
        <div><b>${semanas ? atual.treinos : "—"}</b><span>esta semana</span></div>
        <div><b>${atual.maior ? fmt(atual.maior) + " kg" : "—"}</b><span>maior carga</span></div>
      </div>
      <span class="mini mudo" style="text-align:center">A semana zera domingo às 20h</span>
    </div>
    <div class="entre sec-tit"><span>MEUS TREINOS</span>${feitos.length ? `<a href="#/historico">ver todos</a>` : ""}</div>
    ${feitos.length ? feitos.slice(0, 3).map((s) => cartaoTreinoFeito(s, avP)).join("") : `<div class="feed-card"><span class="mudo peq">Seus treinos finalizados aparecem aqui.</span></div>`}
    ${anteriores.length ? `<details class="cartao hist-sem"><summary><b>Semanas anteriores</b><span class="mini mudo">${anteriores.length}</span></summary>
      <div class="col" style="gap:0;margin-top:8px">${anteriores.map((s) => `<div class="entre hist-sem-l"><span class="peq">${s.rotulo}</span>
        <span class="peq mudo" style="text-align:right">${s.treinos} treino${s.treinos > 1 ? "s" : ""} · máx ${fmt(s.maior)} kg</span></div>`).join("")}</div></details>` : ""}
    <div class="menu-card">
      ${item("#/conquistas", "🏆", "Calendário e conquistas", "")}
      ${item("#/lembrete", ico("sino", 18), "Lembrete de treino", "")}
      ${admin ? item("#/clientes", ico("chave", 18), "Painel de clientes", "Criar contas, renovar e bloquear") : ""}
      ${item("", ico("lapis", 18), "Trocar meu nome", "", 'data-acao="meuNome"')}
      ${item("termos.html", ico("info", 18), "Termos e privacidade", "")}
      ${item("", ico("sair", 18), "Sair da conta", "", 'data-acao="sair"')}
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

// ---------- MEUS TREINOS (histórico: abrir, pôr foto e publicar depois) ----------
export async function telaHistorico() {
  const [avP, ss] = await Promise.all([avatarHtml(38),
    sb.from("sessoes").select("id, ficha_nome, inicio, fim, foto_path, series_feitas(exercicio_nome)").not("fim", "is", null).order("inicio", { ascending: false }).limit(40)
      .then((r) => q(r).filter((s) => s.series_feitas?.length))]);
  render(`<section class="tela">
    <div class="topo"><a class="ico" href="#/perfil" aria-label="Voltar">${ico("voltar")}</a><div class="tit"><h2>Meus treinos</h2><span class="mini mudo">Toque para pôr foto ou publicar</span></div></div>
    ${ss.map((s) => cartaoTreinoFeito(s, avP)).join("") || `<div class="vazio">Nenhum treino finalizado ainda.</div>`}
  </section>${nav("#/perfil")}`);
}
