// Edge Function "como-fazer"
// Recebe o nome de um exercício e devolve como executar (passos, erros comuns, músculos).
// A explicação é gerada pelo Gemini uma única vez por exercício e guardada em public.dicas_exercicio,
// então os próximos pedidos (de qualquer cliente) saem na hora e sem custo.
// Segredos: GEMINI_API_KEY (obrigatório), GEMINI_MODEL (opcional, padrão gemini-3.8-flash)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const prompt = (nome: string) => `Você é um educador físico. Explique como executar corretamente o exercício de academia "${nome}", em português do Brasil, com frases curtas e simples para quem treina sozinho.
Responda SOMENTE com JSON neste formato:
{"nome": string, "musculos": [string], "passos": [string], "erros": [string], "dica": string}
Regras:
- "nome": nome do exercício bem escrito.
- "musculos": 1 a 4 músculos principais.
- "passos": 4 a 6 passos, do posicionamento até o fim do movimento, incluindo a respiração.
- "erros": 3 erros comuns que devem ser evitados.
- "dica": 1 frase de segurança ou de técnica.
- Se o nome não for um exercício reconhecível, responda {"desconhecido": true}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (ue || !u?.user) return json({ erro: "Faça login de novo." }, 401);
  const { data: ativa } = await sb.rpc("conta_ativa");
  if (ativa !== true) return json({ erro: "Seu acesso está suspenso ou vencido." }, 403);

  let body: { nome?: string };
  try { body = await req.json(); } catch { return json({ erro: "Corpo inválido" }, 400); }
  const nome = String(body.nome ?? "").trim().slice(0, 80);
  const chave = normal(nome);
  if (!chave) return json({ erro: "Falta o nome do exercício" }, 400);

  // 1) já explicado antes? devolve na hora
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: salvo } = await adm.from("dicas_exercicio").select("conteudo").eq("chave", chave).maybeSingle();
  if (salvo) return json({ ok: true, resultado: salvo.conteudo, cache: true });

  // 2) pede ao Gemini
  const key = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  if (!key) return json({ erro: "Falta configurar o segredo GEMINI_API_KEY no Supabase." }, 500);
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();
  const pedir = (pensar: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt(nome) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, ...(pensar ? { thinkingConfig: { thinkingLevel: "low" } } : {}) },
    }),
  });
  let r = await pedir(true);
  if (r.status === 400) { const t = await r.text(); r = /thinking/i.test(t) ? await pedir(false) : new Response(t, { status: 400 }); }
  if (!r.ok) {
    const t = await r.text();
    console.error(`Gemini ${r.status} (modelo ${model}): ${t.slice(0, 600)}`);
    return json({ erro: `Gemini respondeu ${r.status}` }, 502);
  }
  const g = await r.json();
  const texto: string = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  let res: Record<string, unknown>;
  try { res = JSON.parse(texto.replace(/^```(json)?/i, "").replace(/```$/, "").trim()); }
  catch { return json({ erro: "Não consegui montar a explicação. Tente de novo." }, 422); }
  if (res.desconhecido) return json({ ok: true, resultado: { desconhecido: true } });

  // 3) guarda para os próximos
  await adm.from("dicas_exercicio").upsert({ chave, nome, conteudo: res });
  return json({ ok: true, resultado: res });
});
