# Maikon CRM

CRM com painel, agenda, leads, Kanban, pendências, follow-up manual, tarefas,
pagamentos, premiações, relatórios, backup e configurações personalizadas.

## Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor → New query**.
3. Execute todo o conteúdo de `supabase/schema.sql`.
4. Abra **Authentication → Users → Add user**.
5. Crie o e-mail e a senha usados no login do CRM.

Em **Project Settings → API Keys**, copie:

- Project URL
- Publishable key ou `anon public`

Nunca use a chave `service_role` no navegador. O CRM acessa o Supabase pelo
servidor (`/api/...`), e os tokens de login ficam em cookies `HttpOnly`.

Se o CRM já estava funcionando antes da inclusão dos planos, execute o arquivo
`supabase/ATUALIZAR-BANCO.sql`. Ele adiciona os novos campos, corrige o acesso das
telas e não apaga os leads existentes.

Execute novamente esse mesmo arquivo quando houver atualização de campos, como
o **status financeiro** em pagamentos.

## Variáveis

Crie um arquivo `.env` somente para desenvolvimento local. Esse arquivo real
fica no seu computador e **não deve ser enviado para o GitHub**.

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
```

No GitHub deve ir apenas o arquivo `.env.example`, sem valores preenchidos.
Nenhuma variável sensível deve usar prefixo público, porque esse tipo de prefixo
envia o valor para o navegador em projetos front-end.

## Rodar localmente

Requisito: Node.js 22 ou superior.

```bash
npm run build
npm start
```

O servidor local abre em `http://127.0.0.1:4173`.

## Publicar na Netlify

Conecte o repositório do GitHub e configure:

```text
Base directory: vazio
Build command: npm run build
Publish directory: dist
```

Em **Project configuration → Environment variables**, cadastre:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Disponibilize as duas variáveis para **Functions** e **Builds** em todos os
contextos. Depois use **Deploys → Trigger deploy → Clear cache and deploy site**.

O log da publicação deve mostrar:

```text
API server-side habilitada: true
```

## Publicar na Vercel

Em **Project Settings → Environment Variables**, cadastre:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Use:

```text
Build command: npm run build
Output directory: dist
```

As variáveis devem ficar direto na Vercel, nunca escritas no código.

## Tabelas

O arquivo `supabase/schema.sql` cria:

- `plans`
- `leads`
- `appointments`
- `pending_items`
- `tasks`
- `followups`
- `option_values`

Todas possuem políticas RLS. Os usuários cadastrados em
**Supabase → Authentication → Users** compartilham a mesma base do CRM. Assim, um
lead criado por um usuário também aparece para os demais usuários autorizados.

Os dados ficam armazenados no Supabase, não na Netlify. Fazer um novo deploy,
limpar o cache ou trocar os arquivos publicados não apaga os cadastros.

Mantenha o cadastro público de usuários desativado no Supabase e crie manualmente
somente os usuários que devem acessar os dados da empresa.

Cada plano possui:

- nome do plano;
- percentual de comissão, como 100% ou 150%.

O valor fechado, a indicação de premiação, sua descrição e seu valor são
informados individualmente no cadastro de cada lead. O CRM aplica o percentual do
plano sobre o valor fechado e salva a comissão calculada. Alterações futuras no
plano não modificam as comissões já registradas nos leads anteriores.

## Pagamentos e Premiações

O menu **Pagamentos** reúne o valor do plano, a comissão calculada e as premiações
registradas nos leads que possuem plano.
É possível filtrar por período, nome do cliente, plano e vigência. O mini dashboard
mostra os totais de comissão, premiação e o total geral do filtro atual.

O botão **Exportar Excel** gera um arquivo `.xls` com as linhas filtradas, datas,
percentuais e valores monetários formatados.

## Melhorias de Produtividade

O CRM inclui:

- busca rápida de clientes no topo;
- alertas no painel para tarefas, pendências e vigências próximas;
- filtros rápidos clicáveis no painel;
- botão para converter lead em cliente;
- histórico do lead com tarefas, pendências e follow-ups;
- agendamento rápido de retorno, criando tarefa automaticamente;
- modelos de mensagem em **Configurações → Follow-up**;
- status financeiro em **Pagamentos**;
- tela **Relatórios** com resumo mensal e exportação;
- tela **Backup** para exportar os principais dados em Excel.

## Segurança

- O navegador não recebe `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` nem qualquer
  token do Supabase via JavaScript.
- O login cria cookies `HttpOnly`, `Secure` em produção e `SameSite=Strict`.
- O app não usa `localStorage` para dados de cliente ou credenciais.
- O `sessionStorage` é limpo quando a aba/página é fechada.
- Respostas de `/api/*` usam `Cache-Control: no-store`.
- `.env`, `.env.*`, `data/`, `dist/`, `.netlify/` e `.vercel/` ficam ignorados
  pelo Git.
