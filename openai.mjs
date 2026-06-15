const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  },
  body: JSON.stringify(body)
});

async function authenticate(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase não configurado na Netlify.");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error("Sessão inválida ou expirada.");
  return response.json();
}

async function getLead(token, id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const response = await fetch(
    `${url}/rest/v1/leads?id=eq.${encodeURIComponent(id)}&select=id,name,status`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) throw new Error("Não foi possível consultar o lead.");
  const rows = await response.json();
  if (!rows[0]) throw new Error("Lead não encontrado.");
  return rows[0];
}

function localSuggestion(lead, context = "", tone = "Profissional") {
  const firstName = lead.name.trim().split(/\s+/)[0];
  const detail = context.trim() ? ` sobre ${context.trim()}` : "";
  let message = `Olá, ${firstName}! Passando para dar continuidade ao nosso atendimento${detail}. Ficou alguma dúvida em que eu possa ajudar?`;
  if (tone === "Direto") message = `Olá, ${firstName}! Gostaria de dar continuidade ao nosso atendimento${detail}. Podemos avançar?`;
  if (tone === "Amigável") message = `Oi, ${firstName}! Tudo bem? Passando para acompanhar nosso atendimento${detail}. Posso ajudar em mais alguma coisa?`;
  return message;
}

function openAIError(status, detail) {
  if (status === 429 && /quota|billing|credit/i.test(detail)) {
    return {
      code: "openai_quota",
      error: "Créditos da API esgotados ou limite mensal atingido.",
      actionUrl: "https://platform.openai.com/settings/organization/billing/overview"
    };
  }
  if (status === 401) {
    return { code: "openai_auth", error: "A chave OPENAI_API_KEY configurada na Netlify é inválida." };
  }
  return { code: "openai_error", error: detail || "A OpenAI não respondeu." };
}

async function callOpenAI(model, input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("Configure OPENAI_API_KEY nas variáveis de ambiente da Netlify.");
    error.publicData = { code: "openai_not_configured", error: error.message };
    throw error;
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: 300
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || `Falha HTTP ${response.status}`;
    const error = new Error(detail);
    error.publicData = openAIError(response.status, detail);
    throw error;
  }
  const message = data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!message?.trim()) throw new Error("A OpenAI não retornou uma mensagem.");
  return message.trim();
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método não permitido." });
  try {
    const authorization = event.headers.authorization || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "Sessão não informada." });
    await authenticate(token);

    const body = JSON.parse(event.body || "{}");
    const configured = Boolean(process.env.OPENAI_API_KEY);
    const model = body.model || process.env.OPENAI_MODEL || "gpt-5.4-mini";

    if (body.action === "status") return json(200, { configured, model });
    if (body.action === "test") {
      const message = await callOpenAI(model, "Responda somente com: Integração funcionando");
      return json(200, { ok: true, message, model });
    }
    if (body.action === "suggest") {
      const lead = await getLead(token, body.lead_id);
      const fallback = localSuggestion(lead, body.context || "", body.tone || "Profissional");
      try {
        const message = await callOpenAI(
          model,
          `Crie uma única mensagem curta de follow-up em português brasileiro para WhatsApp.
Cliente: ${lead.name}
Status atual: ${lead.status}
Tom: ${body.tone || "Profissional"}
Contexto: ${body.context || "sem contexto adicional"}
Resultado esperado: texto natural, útil e pronto para envio, sem markdown, sem inventar informações e com no máximo 80 palavras.`
        );
        return json(200, { message, source: "openai", model });
      } catch (error) {
        const warning = error.publicData || { code: "openai_error", error: error.message };
        return json(200, {
          message: fallback,
          source: "modelo_local",
          warning: warning.error,
          warningCode: warning.code,
          actionUrl: warning.actionUrl || ""
        });
      }
    }
    return json(400, { error: "Ação inválida." });
  } catch (error) {
    const data = error.publicData || { error: error.message || "Não foi possível concluir a operação." };
    return json(data.code === "openai_auth" ? 401 : 400, data);
  }
};
