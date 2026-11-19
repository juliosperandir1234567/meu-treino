# Meu Treino: como colocar no ar

> ✅ **Já feito pelo Claude no seu projeto `dmgyqjyrtnyxqyaeowfa`:** tabelas e segurança (passo 2), função `ler-print` publicada (passo 4.3) e `web/config.js` preenchido (passo 5).
> **Falta só você:** passo 3 (opcional), **passo 4.1 e 4.2** (chave do Gemini) e **passo 6** (publicar na Vercel).

Tudo gratuito: **Supabase** (banco e fotos), **Gemini** do Google (lê os prints) e **Vercel** (hospeda o app).

```
meu-treino/
├─ supabase/
│  ├─ schema.sql                  ← cria as tabelas (passo 2)
│  └─ functions/ler-print/index.ts ← função que lê o print (passo 4)
└─ web/                           ← o app (passos 5 e 6)
```

---

## 1. Criar o projeto no Supabase
1. Em **supabase.com**, crie o projeto (ex.: `meu-treino`, região **South America (São Paulo)**).
2. Anote a senha do banco (não vai precisar agora).

## 2. Criar as tabelas
1. No projeto: **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Deve aparecer "Success". Isso cria as tabelas, a segurança (cada um vê só os seus dados) e a pasta de fotos.

## 3. Login sem esperar o e-mail (opcional, recomendado)
**Authentication → Sign In / Providers → Email** → desligue **Confirm email** → Save.
Assim a conta já entra direto quando você criar no app.

## 4. Função que lê o print
**4.1 Chave grátis do Gemini**
1. Acesse **aistudio.google.com** → **Get API key** → **Create API key**.
2. Copie a chave (começa com `AIza…`).

**4.2 Guardar a chave no Supabase**
**Edge Functions → Secrets → Add new secret**
- Name: `GEMINI_API_KEY`
- Value: a chave do Gemini

**4.3 Criar a função**
1. **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `ler-print` (exatamente assim).
3. Apague o código de exemplo e cole todo o `supabase/functions/ler-print/index.ts`.
4. Clique em **Deploy function**.
5. Abra a função → **Details / Settings** → desligue **Verify JWT with legacy secret** → Save.
   (A própria função já confere se quem chama está logado no app.)

## 5. Ligar o app no seu projeto
1. No Supabase: **Project Settings → API Keys** (ou **Data API**). Copie:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_…`). **Não** use a secret/service_role.
2. Abra `web/config.js` e cole os dois valores.

## 6. Publicar na Vercel (PowerShell)
```powershell
cd C:\caminho\para\meu-treino\web
npx vercel            # 1ª vez: faz login e cria o projeto (aceite as opções padrão)
npx vercel --prod     # publica a versão final
```
A Vercel mostra o endereço (ex.: `https://meu-treino-julio.vercel.app`).

> Sempre que alterar algum arquivo, rode `npx vercel --prod` de novo.

## 7. Instalar no iPhone
1. Abra o endereço no **Safari**.
2. **Compartilhar → Adicionar à Tela de Início**.
3. Abra pelo ícone, toque em **Criar conta** e depois em **Entrar**.

---

## Como usar
- **Primeiro treino:** Hoje → **Mandar print**. Dica: abra os exercícios (setinha ⌄) antes do print para vir série, repetição e carga. Pode mandar até 6 prints de uma vez.
- **Professor trocou o treino:** botão **Atualizar por print**. O app escolhe a ficha parecida, mostra o que é **Novo / Alterado / Removido** e você confirma. Para um treino que ainda não existe, escolha **Criar ficha nova**.
- **Fotos dos aparelhos:** as miniaturas do print do Fiti viram a **Opção 1**. Dentro do treino, toque em **Equipamento · trocar** para tirar foto das opções 2 e 3. Cada opção guarda a própria carga.
- **Avisos:** quando a carga ou as repetições ficam acima ou abaixo da ficha.
- **Descanso:** o cronômetro começa sozinho ao marcar a série. O descanso real fica salvo.
- **Fim do treino:** início e fim são marcados sozinhos (dá pra corrigir), com foto do final e **Publicar** (Story, Post ou Só números).
- **Avaliação física:** mande o print da avaliação da academia ou use **Medir em casa**.

## Limitações do iPhone
- Apps web no iPhone **não vibram**. O aviso de fim de descanso é um **bip**, que não toca com o iPhone no modo silencioso. O número também fica laranja na tela.
- A tela fica acesa durante o treino (iOS 16.4 ou mais novo).

## Se der erro
| Mensagem | O que fazer |
|---|---|
| "Falta configurar" | Preencha o `web/config.js` e publique de novo |
| "Falta configurar o segredo GEMINI_API_KEY" | Passo 4.2 |
| "Faça login de novo" ao ler print | Passo 4.3, item 5 (desligar Verify JWT) |
| "Gemini respondeu 404" | O modelo mudou de nome: crie o segredo `GEMINI_MODEL` com o modelo atual do AI Studio (ex.: `gemini-2.5-flash`) |
| "Gemini respondeu 429" | Limite grátis do minuto/dia. Espere um pouco |
