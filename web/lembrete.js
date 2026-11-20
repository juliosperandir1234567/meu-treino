// Lembrete de treino: notificação no celular nos dias e horário escolhidos (só se ainda não treinou no dia).
import { sb, acoes, mudancas, render, renderSemRolar, h, q, toast, ico, botaoVoltar } from "./util.js";

const NOMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
let sel = null;     // escolha na tela (antes de salvar)
let atual = null;   // o que está salvo para este aparelho

const suporta = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

async function inscricao() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
function chaveBytes(b64) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function telaLembrete() {
  atual = null;
  if (suporta()) {
    try {
      const sub = await inscricao();
      if (sub) atual = q(await sb.from("lembretes").select("*").eq("endpoint", sub.endpoint).maybeSingle());
    } catch { /* sem internet ou sem permissão */ }
  }
  sel = { dias: [...(atual?.dias || [1, 2, 3, 4, 5])], hora: atual?.hora ?? 18 };
  desenhar(false);
}

function desenhar(semRolar = true) {
  let corpo;
  if (!suporta()) {
    corpo = ehIOS() && !instalado() ? `
      <div class="cartao ac-borda"><b>Primeiro, instale o app</b>
        <p class="peq" style="margin:0">No iPhone o lembrete só funciona com o Meu Treino na tela de início:</p>
        <ol class="passos"><li class="passo"><span>1</span><p>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</p></li>
          <li class="passo"><span>2</span><p>Toque em <b>Adicionar à Tela de Início</b>.</p></li>
          <li class="passo"><span>3</span><p>Abra o app pelo ícone novo e volte aqui em <b>Perfil › Lembrete de treino</b>.</p></li></ol></div>`
      : `<div class="cartao"><span class="peq mudo">Este navegador não aceita notificações. No iPhone, use o Safari (iOS 16.4 ou mais novo) com o app instalado na tela de início.</span></div>`;
  } else {
    const bloqueado = Notification.permission === "denied";
    corpo = `
      <div class="cartao">
        <div class="entre"><b>Situação</b>${atual ? `<span class="chip cheio">● Ligado</span>` : `<span class="chip">Desligado</span>`}</div>
        <span class="peq mudo">${atual ? `Você recebe o aviso às <b>${atual.hora}h</b> em ${atual.dias.length === 7 ? "todos os dias" : atual.dias.map((d) => NOMES[d]).join(", ")}, só se ainda não tiver treinado.` : "Receba um aviso no celular dizendo qual é o treino do dia. Se você já treinou, ele não chega."}</span>
      </div>
      <div class="cartao"><b>Dias da semana</b>
        <div class="dias-lem">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="${sel.dias.includes(d) ? "at" : ""}" data-acao="lemDia" data-d="${d}" aria-pressed="${sel.dias.includes(d)}">${NOMES[d]}</button>`).join("")}</div>
        <label class="campo">Horário (de Brasília)
          <select class="inp" data-muda="lemHora">${Array.from({ length: 19 }, (_, i) => i + 5).map((x) => `<option value="${x}" ${x === sel.hora ? "selected" : ""}>${String(x).padStart(2, "0")}:00</option>`).join("")}</select></label>
      </div>
      ${bloqueado ? `<div class="cartao lar-borda"><span class="peq">As notificações estão bloqueadas para este app. Libere em <b>Ajustes › Notificações › Meu Treino</b> e volte aqui.</span></div>` : ""}
      ${atual ? `<button class="btn pri blk grande" data-acao="lemSalvar">Salvar dias e horário</button>
        <div class="grade2"><button class="btn" data-acao="lemTeste">${ico("sino", 16)} Mandar teste</button><button class="btn perigo" data-acao="lemDesligar">Desligar</button></div>`
      : `<button class="btn pri blk grande" data-acao="lemLigar" ${bloqueado ? "disabled" : ""}>${ico("sino", 18)} Ligar lembrete</button>`}`;
  }
  (semRolar ? renderSemRolar : render)(`<section class="tela">
    <div class="topo">${botaoVoltar("#/perfil")}<div class="tit"><span class="rot ac">Perfil</span><h2>Lembrete de treino</h2></div><span style="width:44px"></span></div>
    ${corpo}
  </section>`);
}

acoes.lemDia = (el) => {
  const d = Number(el.dataset.d);
  sel.dias = sel.dias.includes(d) ? sel.dias.filter((x) => x !== d) : [...sel.dias, d].sort();
  desenhar();
};
mudancas.lemHora = (el) => { sel.hora = Number(el.value); };

acoes.lemLigar = async () => {
  if (!sel.dias.length) return toast("Escolha pelo menos um dia");
  const perm = await Notification.requestPermission();   // precisa ser logo no toque
  if (perm !== "granted") { toast("Sem permissão, o lembrete não consegue aparecer", 4000); return desenhar(); }
  const reg = await navigator.serviceWorker.ready;
  const { data, error } = await sb.functions.invoke("lembretes", { body: { acao: "chave" } });
  if (error || !data?.chave) throw new Error("Não consegui ligar agora. Tente de novo.");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(data.chave) });
  const j = sub.toJSON();
  q(await sb.from("lembretes").delete().eq("endpoint", j.endpoint));   // se já existia neste aparelho
  atual = q(await sb.from("lembretes").insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, hora: sel.hora, dias: sel.dias }).select().single());
  toast("Lembrete ligado ✓");
  desenhar();
  sb.functions.invoke("lembretes", { body: { acao: "teste" } }).catch(() => {});
};
acoes.lemSalvar = async () => {
  if (!sel.dias.length) return toast("Escolha pelo menos um dia");
  atual = q(await sb.from("lembretes").update({ hora: sel.hora, dias: sel.dias, ultimo_envio: null }).eq("id", atual.id).select().single());
  toast("Salvo ✓"); desenhar();
};
acoes.lemTeste = async () => {
  const { data, error } = await sb.functions.invoke("lembretes", { body: { acao: "teste" } });
  if (error) throw new Error("Não consegui mandar o teste agora");
  toast(data?.enviados ? "Teste enviado: deve aparecer em instantes" : "Não chegou. Tente desligar e ligar de novo.", 4000);
};
acoes.lemDesligar = async () => {
  q(await sb.from("lembretes").delete().eq("id", atual.id));
  try { (await inscricao())?.unsubscribe(); } catch { /* */ }
  atual = null; toast("Lembrete desligado"); desenhar();
};

// ao sair da conta: este aparelho para de receber os avisos dessa conta
export async function desligarLembreteDoAparelho() {
  try {
    if (!suporta()) return;
    const sub = await inscricao(); if (!sub) return;
    await sb.from("lembretes").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  } catch { /* */ }
}
