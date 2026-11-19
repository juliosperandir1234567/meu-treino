// Edge Function "ler-print"
// Recebe 1 a 6 prints (base64) e devolve o treino ou a avaliação física em JSON.
// Usa a API gratuita do Gemini (Google AI Studio). Segredo necessário: GEMINI_API_KEY
// Opcional: GEMINI_MODEL (padrão gemini-2.5-flash)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT_TREINO = `Você recebe prints de um aplicativo de academia (por exemplo o Fiti) com uma ficha de treino.
Extraia os exercícios na ordem em que aparecem. Se houver mais de um print, junte tudo numa lista só, sem repetir exercícios.
Responda SOMENTE com JSON neste formato:
{"titulo": string|null, "exercicios": [{"nome": string, "series": number|null, "reps": string|null, "carga": number|null, "descanso_seg": number|null, "obs": string|null, "imagem": number, "miniatura": [ymin, xmin, ymax, xmax]|null}]}
Regras:
- "titulo": nome ou letra do treino se aparecer (ex.: "Treino B - Costas"), senão null.
- "nome": exatamente como está escrito, com acentos.
- "reps": texto, ex.: "12", "8-10", "falha". "carga" em kg (número). "descanso_seg" em segundos.
- Use null para o que não aparecer no print. Nunca invente valores.
- "imagem": índice (começando em 0) do print onde o exercício aparece.
- "miniatura": caixa da foto/miniatura do aparelho ao lado do exercício, em coordenadas de 0 a 1000 da imagem; null se não houver foto (quadrado vazio também é null).`;

const PROMPT_AVALIACAO = `Você recebe prints de uma avaliação física de academia.
Responda SOMENTE com JSON neste formato:
{"data": "AAAA-MM-DD"|null, "peso": number|null, "gordura": number|null, "massa_magra": number|null, "imc": number|null, "medidas": {"<nome da medida>": number}}
Regras:
- "gordura" é o percentual de gordura (número, sem %). "peso" e "massa_magra" em kg.
- "medidas": circunferências em cm, com nomes em português como aparecem (ex.: "Braço direito", "Cintura", "Abdômen", "Coxa esquerda").
- Use null para o que não aparecer. Nunca invente valores.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  // Só usuários logados no app podem usar
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u, error: ue } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (ue || !u?.user) return json({ erro: "Faça login de novo." }, 401);

  // Conta bloqueada ou vencida não usa a leitura (economiza a cota do Gemini)
  const { data: ativa } = await sb.rpc("conta_ativa");
  if (ativa !== true) return json({ erro: "Seu acesso está suspenso ou vencido." }, 403);

  const key = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  if (!key) return json({ erro: "Falta configurar o segredo GEMINI_API_KEY no Supabase." }, 500);
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash").trim();

  let body: { tipo?: string; imagens?: { mime: string; dados: string }[] };
  try { body = await req.json(); } catch { return json({ erro: "Corpo inválido" }, 400); }
  const imagens = (body.imagens ?? []).slice(0, 6);
  if (!imagens.length) return json({ erro: "Nenhuma imagem enviada" }, 400);
  const prompt = body.tipo === "avaliacao" ? PROMPT_AVALIACAO : PROMPT_TREINO;

  const parts: unknown[] = [{ text: prompt }];
  imagens.forEach((im, i) => {
    parts.push({ text: `Print ${i}:` });
    parts.push({ inline_data: { mime_type: im.mime || "image/jpeg", data: im.dados } });
  });

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error(`Gemini ${r.status} (modelo ${model}): ${t.slice(0, 800)}`);
    return json({ erro: `Gemini respondeu ${r.status}`, detalhe: t.slice(0, 500) }, 502);
  }
  const g = await r.json();
  const texto: string = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    const limpo = texto.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    return json({ ok: true, resultado: JSON.parse(limpo) });
  } catch {
    return json({ erro: "Não consegui entender o print. Tente um print mais nítido.", detalhe: texto.slice(0, 500) }, 422);
  }
});
