// Primeiro acesso: explica o app em 3 passos, pergunta o nome e pede o aceite dos termos (LGPD).
import { sb, sessao, acoes, render, h, q, ico, ir, toast } from "./util.js";

const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function telaBoasVindas() {
  const nome = (sessao.perfil?.nome || "").trim();
  const passo = (i, icone, tit, txt) => `<div class="bv-passo"><span class="bv-num">${ico(icone, 20)}</span>
    <div class="col" style="gap:2px"><span class="mini ac" style="font-weight:700">PASSO ${i}</span><b>${tit}</b><span class="peq mudo">${txt}</span></div></div>`;
  render(`<section class="tela bv">
    <div class="heroi bv-topo">
      <span class="letra xg">${ico("peso", 34)}</span>
      <h1 class="heroi-tit">Bem-vindo${nome ? ", " + h(nome.split(" ")[0]) : ""}!</h1>
      <p style="margin:0;opacity:.9">Seu treino, suas cargas e sua evolução num lugar só. Leva 1 minuto para começar.</p>
    </div>
    <div class="cartao bv-passos">
      ${passo(1, "lista", "Cole o seu treino", "Cole o texto da ficha, um exercício por linha (ex.: Supino reto 4x10 30kg). O app monta tudo sozinho.")}
      ${passo(2, "check", "Marque cada série", "O app lembra a carga da última vez, conta o descanso e funciona até sem internet.")}
      ${passo(3, "sobe", "Acompanhe a evolução", "Toda semana: o que subiu, seus recordes e quando é hora de aumentar o peso.")}
    </div>
    ${ehIOS() && !instalado() ? `<div class="cartao ac-borda"><b>Dica: deixe o app na tela de início</b>
      <span class="peq mudo">No Safari, toque em <b>Compartilhar</b> (quadrado com seta) e depois em <b>Adicionar à Tela de Início</b>. Ele abre como um app de verdade e pode te lembrar do treino.</span></div>` : ""}
    <form class="cartao" data-envia="boasVindas">
      <label class="campo">Como você quer ser chamado?<input class="inp" name="nome" value="${h(nome)}" maxlength="60" autocomplete="given-name" required></label>
      <label class="aceite"><input type="checkbox" name="aceite" required>
        <span>Li e aceito os <a href="termos.html" target="_blank" rel="noopener">Termos de uso e a Política de privacidade</a>, incluindo o uso dos meus dados de treino e medidas para o app funcionar.</span></label>
      <button class="btn pri blk grande" type="submit">Começar</button>
    </form>
  </section>`);
}

acoes.boasVindas = async (form) => {
  const f = new FormData(form);
  if (!f.get("aceite")) return toast("Para usar o app, aceite os termos");
  const nome = String(f.get("nome") || "").trim();
  if (nome && nome !== (sessao.perfil?.nome || "").trim()) q(await sb.rpc("definir_meu_nome", { novo: nome }));
  q(await sb.rpc("aceitar_termos"));
  if (sessao.perfil) { sessao.perfil.nome = nome || sessao.perfil.nome; sessao.perfil.termos_em = new Date().toISOString(); }
  try { localStorage.setItem("perfil-" + sessao.user.id, JSON.stringify(sessao.perfil)); } catch { /* */ }
  ir("#/hoje");
};
