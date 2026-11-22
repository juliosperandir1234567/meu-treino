// Lembrete de treino por notificação (Web Push).
// - {acao:"chave"}  → chave pública para o celular se inscrever (cria as chaves na 1ª vez; a privada nunca sai do banco)
// - {acao:"teste"}  → manda uma notificação de teste para a própria pessoa
// - chamada do agendador (cabeçalho x-cron) → envia os lembretes desta hora
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function chaves() {
  const { data, error } = await adm.from("push_config").select("*").eq("id", 1).single();
  if (error) throw error;
  if (data.publica && data.privada) return data;
  const k = webpush.generateVAPIDKeys();
  const { data: d2, error: e2 } = await adm.from("push_config").update({ publica: k.publicKey, privada: k.privateKey }).eq("id", 1).select().single();
  if (e2) throw e2;
  return d2;
}

async function enviar(cfg: any, l: any, msg: Record<string, string>) {
  webpush.setVapidDetails("https://meu-treino-web-one.vercel.app", cfg.publica, cfg.privada);
  try {
    await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, JSON.stringify(msg), { TTL: 3600 });
    return true;
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) await adm.from("lembretes").delete().eq("id", l.id);   // inscrição velha
    else console.error("push falhou", e?.statusCode, e?.body || e?.message);
    return false;
  }
}

const hojeSP = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function contaAtiva(uid: string, hoje: string) {
  const { data: p } = await adm.from("perfis").select("papel, ativo, acesso_ate").eq("id", uid).maybeSingle();
  if (!p) return false;
  if (p.papel === "admin") return true;
  return p.ativo && (!p.acesso_ate || p.acesso_ate >= hoje);
}

async function mensagemPara(uid: string, hoje: string) {
  const ini = new Date(hoje + "T00:00:00-03:00").toISOString();
  const { data: ss0 } = await adm.from("sessoes").select("ficha_id, inicio, series_feitas(count)").eq("user_id", uid).order("inicio", { ascending: false }).limit(30);
  const ss = (ss0 || []).filter((s: any) => (s.series_feitas?.[0]?.count || 0) > 0);   // só conta treino com série feita
  if (ss.some((s: any) => s.inicio >= ini)) return null;   // já treinou hoje
  const { data: fichas } = await adm.from("fichas").select("id, letra, nome").eq("user_id", uid).order("ordem").order("letra");
  if (!fichas?.length) return { title: "Hora do treino 💪", body: "Bora treinar hoje? Abra o app e monte sua ficha.", url: "#/hoje" };
  // semana nova (domingo 20h, horário de Brasília) recomeça no Treino A
  const dow = new Date(hoje + "T12:00:00-03:00").getUTCDay();
  const dom = new Date(new Date(hoje + "T20:00:00-03:00").getTime() - dow * 864e5);
  if (dom.getTime() > Date.now()) dom.setTime(dom.getTime() - 7 * 864e5);
  let prox = fichas.find((f: any) => f.letra === "A") || fichas[0];
  const ult = (ss || []).find((s: any) => new Date(s.inicio).getTime() >= dom.getTime() && fichas.some((f: any) => f.id === s.ficha_id));
  if (ult) { const i = fichas.findIndex((f: any) => f.id === ult.ficha_id); prox = fichas[(i + 1) % fichas.length]; }
  const nome = `Treino ${prox.letra}${prox.nome ? " · " + prox.nome : ""}`;
  return { title: "Hora do treino 💪", body: `Hoje é dia de ${nome}. Bora?`, url: "#/hoje" };
}

async function rodarAgendado() {
  const cfg = await chaves();
  const hoje = hojeSP();
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hora = agora.getHours(), dia = agora.getDay();
  const { data: ls, error } = await adm.from("lembretes").select("*").eq("hora", hora).contains("dias", [dia]).or(`ultimo_envio.is.null,ultimo_envio.lt.${hoje}`);
  if (error) throw error;
  let enviados = 0;
  const msgs = new Map<string, any>();
  for (const l of ls || []) {
    if (!msgs.has(l.user_id)) msgs.set(l.user_id, (await contaAtiva(l.user_id, hoje)) ? await mensagemPara(l.user_id, hoje) : null);
    const m = msgs.get(l.user_id);
    if (m && await enviar(cfg, l, m)) enviados++;
    await adm.from("lembretes").update({ ultimo_envio: hoje }).eq("id", l.id);
  }
  console.log(`Lembretes ${hoje} ${hora}h: ${ls?.length || 0} inscrições, ${enviados} enviados`);
  return { inscricoes: ls?.length || 0, enviados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // agendador
    const tokenCron = req.headers.get("x-cron");
    if (tokenCron) {
      const { data } = await adm.from("push_config").select("token_cron").eq("id", 1).single();
      if (!data || data.token_cron !== tokenCron) return json({ erro: "não autorizado" }, 401);
      return json({ ok: true, ...(await rodarAgendado()) });
    }
    // pessoa logada
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await adm.auth.getUser(jwt);
    if (!u?.user) return json({ erro: "Faça login de novo" }, 401);
    if (!(await contaAtiva(u.user.id, hojeSP()))) return json({ erro: "Seu acesso não está ativo" }, 403);
    const { acao } = await req.json().catch(() => ({}));
    const cfg = await chaves();
    if (acao === "chave") return json({ ok: true, chave: cfg.publica });
    if (acao === "teste") {
      const { data: ls } = await adm.from("lembretes").select("*").eq("user_id", u.user.id);
      let n = 0;
      for (const l of ls || []) if (await enviar(cfg, l, { title: "Lembrete ligado ✅", body: "É assim que o aviso do treino vai aparecer.", url: "#/hoje" })) n++;
      return json({ ok: true, enviados: n });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Não consegui agora. Tente de novo." }, 500);
  }
});
