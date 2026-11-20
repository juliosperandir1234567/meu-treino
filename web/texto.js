// Lê uma ficha de treino escrita em texto (colada ou digitada), sem IA.
// Entende formatos comuns: "Supino reto 4x10 30kg", "Puxada - 3 x 10 a 12 - 25 kg - 60s",
// "Leg press 4 séries 15 repetições", e também um exercício por bloco (nome numa linha,
// séries/reps/carga nas linhas de baixo), como vem ao copiar de alguns apps.

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const FAIXA = String.raw`\d{1,3}(?:\s*(?:-|–|a|/|até|ate)\s*\d{1,3})?`;
const FIM = String.raw`(?![a-zà-ú])`;   // fim de palavra (também com acento)

function faixa(s) {
  return s.replace(/\s*(?:–|a|\/|até|ate)\s*/i, "-").replace(/\s*-\s*/, "-").replace(/\s+/g, "");
}
const numero = (s) => Number(String(s).replace(",", "."));
const re = (txt) => new RegExp(txt, "i");

// tira os pedaços reconhecidos da linha e devolve os campos + o que sobrou (o nome)
function campos(linha) {
  let s = " " + linha + " ";
  const r = { series: null, reps: null, carga: null, descanso_seg: null };
  let obs = null;
  const tirar = (rx, fn) => { s = s.replace(rx, (...m) => { fn(m); return " "; }); };

  // séries x repetições: "4x10", "4 x 10-12", "3X12", "3 x falha", "4*8"
  tirar(re(String.raw`(\d{1,2})\s*[x×*]\s*(${FAIXA}|falha|m[aá]x(?:imo)?)`), (m) => { r.series = Number(m[1]); r.reps = /\d/.test(m[2]) ? faixa(m[2]) : m[2].toLowerCase(); });
  // "4 séries", "séries: 4"
  tirar(/(\d{1,2})\s*s[ée]ries?/i, (m) => { r.series = Number(m[1]); });
  tirar(/s[ée]ries?\s*[:\-–]?\s*(\d{1,2})/i, (m) => { r.series = Number(m[1]); });
  // "12 repetições", "10-12 reps", "repetições: 12"
  tirar(re(String.raw`(${FAIXA})\s*(?:repeti[cç](?:õ|o)es|repeti[cç][aã]o|reps?|rep\.)`), (m) => { r.reps = faixa(m[1]); });
  tirar(re(String.raw`(?:repeti[cç](?:õ|o)es|reps?)\s*[:\-–]?\s*(${FAIXA}|falha)`), (m) => { r.reps = /\d/.test(m[1]) ? faixa(m[1]) : "falha"; });

  // descanso: "descanso 60s", "intervalo: 1min", "1'30", "90 seg", "2 min"
  tirar(re(String.raw`(?:descanso|desc\.?|intervalo|pausa)\s*[:\-–]?\s*(\d+)\s*(?:'|min(?:utos?)?|m)\s*(\d{1,2})?\s*(?:s|seg|"|”)?${FIM}`), (m) => { r.descanso_seg = Number(m[1]) * 60 + Number(m[2] || 0); });
  tirar(re(String.raw`(?:descanso|desc\.?|intervalo|pausa)\s*[:\-–]?\s*(\d+)\s*(?:s|seg(?:undos?)?|"|”)?${FIM}`), (m) => { r.descanso_seg = Number(m[1]); });
  tirar(re(String.raw`(\d+)\s*(?:'|min(?:utos?)?)\s*(\d{1,2})\s*(?:"|”|s|seg)?${FIM}`), (m) => { r.descanso_seg = Number(m[1]) * 60 + Number(m[2]); });
  tirar(re(String.raw`(\d+)\s*min(?:utos?)?${FIM}`), (m) => { r.descanso_seg = Number(m[1]) * 60; });
  tirar(re(String.raw`(\d+)\s*(?:s|seg|segundos?|"|”)${FIM}`), (m) => { r.descanso_seg = Number(m[1]); });

  // carga: "30kg", "30 kg", "carga: 30", "30 quilos"
  tirar(re(String.raw`(?:carga|peso)\s*[:\-–]?\s*(${NUM})\s*(?:kg|kgs|quilos?)?`), (m) => { r.carga = numero(m[1]); });
  tirar(re(String.raw`(${NUM})\s*(?:kg|kgs|quilos?)${FIM}`), (m) => { r.carga = numero(m[1]); });

  tirar(/(cada lado|por lado|cada perna|cada braço)/gi, (m) => { obs = m[1].toLowerCase(); });

  const sobra = s.replace(/[|•·▪►]/g, " ").replace(/\(\s*\)/g, " ").replace(/\s[-–:,;/]+(?=\s|$)/g, " ")
    .replace(/^[\s\-–:,;/]+|[\s\-–:,;/(]+$/g, "").replace(/\s{2,}/g, " ")
    .replace(/\s+(de|com|e|x)$/i, "").replace(/[\s\-–:,;]+$/, "").trim();
  return { r, sobra, obs };
}

const temLetras = (s) => /[a-zà-ú]{2,}/i.test(s);
const ehCabecalho = (s) => /^(treino|ficha|dia|rotina)\s*[a-z0-9]?\b/i.test(s) && !/\d+\s*[x×]\s*\d/.test(s);
const lixo = /^(aquecimento|alongamento|observa[cç](õ|o)es?|obs\.?|cardio)\b/i;
const PALAVRAS_DETALHE = /\b(carga|peso|kg|s[ée]ries?|reps?|repeti[cç](õ|o)es|descanso|intervalo|cada lado)\b/gi;

export function lerTexto(texto, qual = "") {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  // vários treinos no mesmo texto: fica só com o pedido (ou o primeiro)
  const blocos = [];
  for (const l of linhas) {
    const limpa = l.replace(/^[#*_\s]+|[*_:\s]+$/g, "");
    if (ehCabecalho(limpa)) blocos.push({ titulo: limpa, linhas: [] });
    else if (!blocos.length) blocos.push({ titulo: null, linhas: [l] });
    else blocos[blocos.length - 1].linhas.push(l);
  }
  const q = qual.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escolhido = (q && blocos.find((b) => b.titulo && re(String.raw`\b${q}\b`).test(b.titulo)))
    || blocos.find((b) => b.linhas.length) || { titulo: null, linhas: [] };

  const exercicios = [];
  for (const bruta of escolhido.linhas) {
    const l = bruta.replace(/^(\d{1,2}\s*[.)\-–:º°]\s*|[-*•·▪►✓✔]\s*)/, "").trim();
    if (!l || lixo.test(l)) continue;
    const { r, sobra, obs } = campos(l);
    const ult = exercicios[exercicios.length - 1];
    if (!temLetras(sobra.replace(PALAVRAS_DETALHE, ""))) {   // linha só com números: completa o exercício de cima
      if (ult) for (const k of Object.keys(r)) if (r[k] != null && ult[k] == null) ult[k] = r[k];
      continue;
    }
    exercicios.push({ nome: sobra.charAt(0).toUpperCase() + sobra.slice(1), ...r, obs, imagem: 0, miniatura: null });
  }
  return { titulo: escolhido.titulo, exercicios };
}
