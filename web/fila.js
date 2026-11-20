// Fila de envio: o que o treino grava fica primeiro no celular e vai para o servidor
// assim que der. Se a internet cair na academia, nada se perde — envia quando voltar.
import { sb, toast } from "./util.js";

const CHAVE = "fila-envio-v1";
let enviando = null;
const ouvintes = new Set();

export function idNovo() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const x = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return []; } }
function gravar(f) { try { localStorage.setItem(CHAVE, JSON.stringify(f)); } catch { /* sem espaço */ } ouvintes.forEach((fn) => fn(f.length)); }
export const pendentes = () => ler().length;
export function aoMudarFila(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
// itens ainda não enviados de uma tabela (para juntar com o que veio do servidor)
export const naFila = (tab) => ler().filter((o) => o.tab === tab);

// op: { tipo: "ins" | "upd" | "del", tab, id, dados }
export function enfileirar(op) {
  let f = ler();
  if (op.tipo === "del" && f.some((o) => o.tipo === "ins" && o.tab === op.tab && o.id === op.id)) {
    // ainda nem tinha subido: basta esquecer o que estava na fila
    f = f.filter((o) => o.id !== op.id || o.tab !== op.tab);
  } else if (op.tipo === "upd" && f.some((o) => o.tipo === "ins" && o.tab === op.tab && o.id === op.id)) {
    const ins = f.find((o) => o.tipo === "ins" && o.tab === op.tab && o.id === op.id);
    Object.assign(ins.dados, op.dados);
  } else f.push({ ...op, em: Date.now() });
  gravar(f);
  return enviar();
}

const ehRede = (e) => !navigator.onLine || /fetch|network|load failed|conex|timeout/i.test(String(e?.message || e || ""));

async function executar(o) {
  const t = sb.from(o.tab);
  if (o.tipo === "ins") return t.insert({ id: o.id, ...o.dados });
  if (o.tipo === "upd") return t.update(o.dados).eq("id", o.id);
  return t.delete().eq("id", o.id);
}

// Envia tudo, em ordem. Para no primeiro problema de internet e tenta de novo depois.
export function enviar() {
  if (enviando) return enviando;
  enviando = (async () => {
    let f = ler();
    while (f.length) {
      if (!navigator.onLine) break;
      const o = f[0];
      let res;
      try { res = await executar(o); } catch (e) { res = { error: e }; }
      const e = res?.error;
      if (e && ehRede(e)) break;
      if (e && e.code !== "23505") {   // 23505 = já estava lá (enviado antes); qualquer outro erro: tenta algumas vezes
        o.tentativas = (o.tentativas || 0) + 1;
        if (o.tentativas < 5) { gravar(f); break; }
        console.error("descartado da fila", o, e);
        toast("Uma série não pôde ser salva no servidor: " + (e.message || e.code), 5000);
      }
      f = ler(); f.shift(); gravar(f);
    }
    return ler().length;
  })().finally(() => { enviando = null; });
  return enviando;
}

window.addEventListener("online", () => { const antes = ler().length; enviar().then((n) => { if (antes && !n) toast("Internet voltou: treino enviado ✓"); }); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") enviar(); });
setTimeout(() => enviar(), 1500);
