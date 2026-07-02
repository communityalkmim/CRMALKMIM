import { handleApiRequest } from "../serverless/api-core.mjs";

export default async function handler(req, res) {
  const response = await handleApiRequest({
    path: req.url?.split("?")[0] || "/api",
    method: req.method,
    headers: req.headers || {},
    body: await readBody(req)
  });
  Object.entries(response.headers || {}).forEach(([name, value]) => res.setHeader(name, value));
  if (response.setCookies?.length) res.setHeader("Set-Cookie", response.setCookies);
  res.status(response.statusCode).send(response.body);
}

function readBody(req) {
  if (req.body) return Promise.resolve(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
