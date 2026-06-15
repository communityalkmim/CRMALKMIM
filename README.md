# Maikon CRM

CRM com painel, agenda, leads, Kanban, pendências, follow-up manual, tarefas,
pagamentos, premiações e configurações personalizadas.

## Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor → New query**.
3. Execute todo o conteúdo de `supabase/schema.sql`.
4. Abra **Authentication → Users → Add user**.
5. Crie o e-mail e a senha usados no login do CRM.

Em **Project Settings → API Keys**, copie:

- Project URL
- Publishable key ou `anon public`

Nunca use a chave `service_role` no navegador.

Se o CRM já estava funcionando antes da inclusão dos planos, execute novamente o
arquivo `supabase/schema.sql`. Ele adiciona os novos campos sem apagar os leads
existentes.

## Variáveis

Crie um arquivo `.env` para desenvolvimento local:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

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
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Disponibilize as duas variáveis para **Builds** em todos os contextos. Depois use
**Deploys → Trigger deploy → Clear cache and deploy site**.

O log da publicação deve mostrar:

```text
Supabase configurado: true
```

## Tabelas

O arquivo `supabase/schema.sql` cria:

- `plans`
- `leads`
- `appointments`
- `pending_items`
- `tasks`
- `followups`
- `option_values`

Todas possuem políticas RLS para que cada usuário acesse somente seus próprios dados.

Cada plano possui:

- valor da primeira parcela;
- percentual de comissão, como 100% ou 150%;
- indicação de premiação;
- descrição e valor da premiação.

Ao selecionar um plano no lead, o CRM calcula automaticamente a comissão e salva
uma cópia da regra comercial utilizada. Alterações futuras no plano não modificam
as comissões já registradas nos leads anteriores.

## Pagamentos e Premiações

O menu **Pagamentos** reúne os valores registrados nos leads que possuem plano.
É possível filtrar por período, nome do cliente, plano e vigência. O mini dashboard
mostra os totais de comissão, premiação e o total geral do filtro atual.

O botão **Exportar Excel** gera um arquivo `.xls` com as linhas filtradas, datas,
percentuais e valores monetários formatados.
