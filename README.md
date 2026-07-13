# Maikon CRM

CRM com painel, agenda, leads, Kanban, pendencias, follow-up manual, tarefas,
pagamentos, premiacoes, relatorios, backup e configuracoes personalizadas.

## Supabase

1. Crie um projeto em https://supabase.com.
2. Abra SQL Editor > New query.
3. Execute todo o conteudo de `supabase/schema.sql`.
4. Abra Authentication > Users > Add user.
5. Crie o e-mail e a senha usados no login do CRM.

Em Project Settings > API Keys, copie:

- Project URL.
- Publishable key ou anon public.

Nunca use a chave `service_role` no navegador. O CRM acessa o Supabase pelo
servidor (`/api/...`), e os tokens de login ficam em cookies `HttpOnly`.

Se o CRM ja estava funcionando antes da inclusao de planos ou status financeiro,
execute tambem `supabase/ATUALIZAR-BANCO.sql`. Ele adiciona novos campos e nao
apaga os leads existentes.

## Variaveis de ambiente

Crie um arquivo `.env` somente para desenvolvimento local. Esse arquivo real
fica no seu computador e nao deve ser enviado para o GitHub.

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
```

No GitHub deve ir apenas o arquivo `.env.example`, sem valores preenchidos.
Nenhuma variavel sensivel deve usar prefixo publico, porque esse tipo de prefixo
envia o valor para o navegador em projetos front-end.

## Rodar localmente

Requisito: Node.js 22 ou superior.

```bash
npm run dev
```

O desenvolvimento local usa o mesmo caminho da producao: site estatico em
`dist/` e API em Netlify Functions. O servidor local abre em
`http://127.0.0.1:4173`.

Antes de enviar mudancas, rode:

```bash
npm test
npm run build
```

O antigo servidor SQLite foi isolado em `legacy/server-sqlite.js` e nao deve ser
usado como fluxo principal. Ele existe apenas para consulta ou migracao de dados
antigos:

```bash
npm run legacy:sqlite
```

## Publicar na Netlify

Conecte o repositorio do GitHub e configure:

```text
Base directory: vazio
Build command: npm run build
Publish directory: dist
```

Em Project configuration > Environment variables, cadastre:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Disponibilize as duas variaveis para Functions e Builds em todos os contextos.
Depois use Deploys > Trigger deploy > Clear cache and deploy site.

O log da publicacao deve mostrar:

```text
API server-side habilitada: true
```

## GitHub e CI

O projeto deve ficar conectado ao GitHub. Evite upload manual de ZIP, porque
isso pula revisao, historico e testes.

O workflow `.github/workflows/ci.yml` roda automaticamente em `push` e
`pull_request`:

```bash
npm test
npm run build
```

Na Netlify, mantenha o deploy ligado ao repositorio GitHub. Assim cada alteracao
publicada passa pelo mesmo build que voce testou localmente.

## Publicar na Vercel

Em Project Settings > Environment Variables, cadastre:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Use:

```text
Build command: npm run build
Output directory: dist
```

As variaveis devem ficar direto na Vercel, nunca escritas no codigo.

## Tabelas

O arquivo `supabase/schema.sql` cria:

- `plans`
- `leads`
- `appointments`
- `pending_items`
- `tasks`
- `followups`
- `option_values`

Todas possuem politicas RLS. Cada usuario autenticado enxerga os proprios
registros gravados com seu `user_id`. Se precisar de uma operacao com varios
usuarios compartilhando a mesma carteira de clientes, crie um modelo de equipe
com `team_id` ou `organization_id` em vez de abrir as politicas de acesso.

Os dados ficam armazenados no Supabase, nao na Netlify. Fazer novo deploy,
limpar cache ou trocar arquivos publicados nao apaga os cadastros.

Mantenha o cadastro publico de usuarios desativado no Supabase e crie
manualmente somente os usuarios que devem acessar os dados da empresa.

Cada plano possui:

- nome do plano;
- percentual de comissao, como 100% ou 150%.

O valor fechado, a indicacao de premiacao, sua descricao e seu valor sao
informados individualmente no cadastro de cada lead. O CRM aplica o percentual
do plano sobre o valor fechado e salva a comissao calculada. Alteracoes futuras
no plano nao modificam as comissoes ja registradas nos leads anteriores.

## Pagamentos e Premiacoes

O menu Pagamentos reune o valor do plano, a comissao calculada e as premiacoes
registradas nos leads que possuem plano.

E possivel filtrar por periodo, nome do cliente, plano e vigencia. O mini
dashboard mostra os totais de acordo com o filtro atual.

O botao Exportar Excel gera um arquivo `.xls` com as linhas filtradas, datas,
percentuais e valores monetarios formatados.

## Paginacao da API

As listagens continuam retornando arrays para manter compatibilidade com a tela
atual, mas aceitam paginacao quando a base crescer:

```text
/api/leads?limit=100&page=2
/api/tasks?limit=100&offset=100
```

O limite maximo aceito por chamada e 500 registros.

## Melhorias de produtividade

O CRM inclui:

- busca rapida de clientes no topo;
- alertas no painel para tarefas, pendencias e vigencias proximas;
- filtros rapidos clicaveis no painel;
- botao para converter lead em cliente;
- historico do lead com tarefas, pendencias e follow-ups;
- agendamento rapido de retorno, criando tarefa automaticamente;
- modelos de mensagem em Configuracoes > Follow-up;
- status financeiro em Pagamentos;
- tela Relatorios com resumo mensal e exportacao;
- tela Backup para exportar os principais dados em Excel.

## Seguranca

- O navegador nao recebe `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` nem qualquer
  token do Supabase via JavaScript.
- O login cria cookies `HttpOnly`, `Secure` em producao e `SameSite=Strict`.
- `/api/login` aplica rate limit por IP/e-mail para reduzir tentativa de forca
  bruta.
- Requisicoes que alteram dados exigem JSON, token CSRF e origem do proprio site.
- As tabelas usam RLS por usuario e as funcoes administrativas nao ficam expostas
  aos perfis `anon` ou `authenticated` sem necessidade.
- O app nao usa `localStorage` para dados de cliente ou credenciais.
- O `sessionStorage` e limpo quando a aba/pagina e fechada.
- Respostas de `/api/*` usam `Cache-Control: no-store`.
- No Supabase, ative `Authentication > Sign In / Providers > Password > Leaked
  password protection` para bloquear senhas encontradas em vazamentos conhecidos.
- `.env`, `.env.*`, `data/`, `dist/`, `.netlify/` e `.vercel/` ficam ignorados
  pelo Git.
