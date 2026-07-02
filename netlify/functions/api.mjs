import { handleApiRequest } from "../../serverless/api-core.mjs";

export async function handler(event) {
  const rawPath = event.path || "/api";
  const path = rawPath.startsWith("/.netlify/functions/api")
    ? `/api${rawPath.slice("/.netlify/functions/api".length)}`
    : rawPath;
  const response = await handleApiRequest({
    path,
    method: event.httpMethod,
    headers: event.headers || {},
    body: event.body || ""
  });
  const { setCookies, ...rest } = response;
  return {
    ...rest,
    multiValueHeaders: setCookies?.length ? { "Set-Cookie": setCookies } : undefined
  };
}
