# Maikon CRM

CRM com painel, agenda, leads, Kanban, pendências, follow-up, tarefas e marketing.

O projeto possui dois modos:

- **Produção:** Netlify + Supabase.
- **Compatibilidade local:** servidor Node + SQLite existente.

## 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**.
3. Copie todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
4. Cole no editor e clique em **Run**.
5. Abra **Authentication → Users → Add user**.
6. Crie o e-mail e a senha que serão usados para entrar no CRM.

O login publicado utiliza **e-mail e senha do Supabase Auth**. O acesso local antigo
`MAIKONSAUDE / ABC123` continua disponível somente no modo SQLite.

### Encontrar as chaves

No Supabase, abra **Project Settings → API** e copie:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

A chave `anon` pode ficar no navegador porque o banco está protegido por Row Level
Security. Nunca coloque a `service_role` no site ou em uma variável `NEXT_PUBLIC`.

## 2. Variáveis de ambiente

Copie `.env.example` para `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
OPENAI_API_KEY=SUA_CHAVE_OPENAI
OPENAI_MODEL=gpt-5.4-mini
```

As duas primeiras variáveis são obrigatórias. As variáveis da OpenAI são opcionais;
sem elas, o follow-up continua usando a sugestão local.

## 3. Rodar localmente

Requisito: Node.js 22 ou superior.

```bash
npm run dev
```

O comando usa o ambiente local da Netlify, incluindo as Functions e o arquivo `.env`.
Na primeira execução, o `npx` pode solicitar a instalação do Netlify CLI.

Para testar apenas o build estático:

```bash
npm run build
```

O site pronto será gerado em `dist/`.

## 4. Publicar gratuitamente na Netlify

1. Coloque esta pasta em um repositório GitHub, GitLab ou Bitbucket.
2. Na Netlify, escolha **Add new site → Import an existing project**.
3. Selecione o repositório.
4. A Netlify lerá automaticamente o arquivo `netlify.toml`.
5. Confirme:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
6. Publique o site.

### Variáveis na Netlify

Abra:

**Site configuration → Environment variables → Add a variable**

Cadastre:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
OPENAI_API_KEY
OPENAI_MODEL
```

Depois, acesse **Deploys → Trigger deploy → Clear cache and deploy site**.

As duas variáveis `NEXT_PUBLIC_SUPABASE_*` precisam estar disponíveis durante o
**Build**. O deploy da Netlify será interrompido com uma mensagem clara se elas
estiverem vazias.

`OPENAI_API_KEY` é privada e fica disponível apenas dentro da Netlify Function.
Ela nunca é enviada ao navegador nem armazenada no Supabase.

## 5. Tabelas criadas no Supabase

O arquivo `supabase/schema.sql` cria:

| Tabela | Uso |
|---|---|
| `leads` | Contatos, origem, status, comissão e observações |
| `appointments` | Agenda e lembretes |
| `pending_items` | Documentos, retornos e outras pendências |
| `tasks` | Tarefas, prioridades, categorias e status |
| `marketing` | Ações e campanhas |
| `followups` | Histórico das mensagens de acompanhamento |
| `option_values` | Opções personalizadas e colunas do Kanban |
| `app_settings` | Configurações não sensíveis, como o modelo da OpenAI |

Todas as tabelas possuem `user_id` e políticas RLS. Cada usuário autenticado acessa
somente os próprios registros.

O SQL também cria as funções:

- `rename_option_value`: renomeia uma opção e atualiza os registros relacionados.
- `delete_option_value`: exclui somente opções que não estejam sendo usadas.

## 6. Operações disponíveis

O site usa o Supabase para:

- cadastrar;
- listar;
- editar;
- excluir;
- autenticar usuários;
- mover leads entre colunas do Kanban;
- guardar configurações personalizadas.

## 7. Migrar os dados atuais do SQLite

Esta etapa é opcional. Ela transfere os registros existentes de `data/crm.db`.

1. Crie o usuário em **Authentication → Users**.
2. Copie o UUID desse usuário.
3. No Supabase, copie a chave `service_role`.
4. Defina temporariamente:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_USER_ID=
```

5. Execute:

```bash
npm run migrate:supabase
```

Use a chave `service_role` apenas localmente para a migração. Não a cadastre na
Netlify e não a publique no Git.

## Segurança

- A chave pública `anon` é protegida pelas políticas RLS.
- A chave da OpenAI fica somente na Netlify Function.
- A chave `service_role` não é usada pelo site.
- O arquivo `.env`, o banco SQLite e a pasta `data/` estão ignorados pelo Git.
