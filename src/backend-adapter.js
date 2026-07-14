import { BackendError } from "./engine.js";

/**
 * Fills {path_param} placeholders in an endpoint path using values from args,
 * and returns the remaining args (the ones NOT consumed as path params) as
 * the request body / query.
 */
export function buildUrl(baseUrl, endpointPath, args) {
  const remaining = { ...args };
  const filledPath = endpointPath.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in remaining)) {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    const val = remaining[key];
    delete remaining[key];
    return encodeURIComponent(val);
  });
  return { url: baseUrl + filledPath, remaining };
}

/**
 * Runs the real HTTP call against the site's backend.
 *
 * This is the extracted core of AxlEngine._executeHttp — byte-for-byte
 * identical behavior, just relocated into its own module so it can be
 * tested and reused independently.
 */
export async function executeHttpCall(baseUrl, actionDef, args, context) {
  const { url, remaining } = buildUrl(baseUrl, actionDef.endpoint.path, args);
  const method = actionDef.endpoint.method;

  const headers = { "Content-Type": "application/json" };
  if (context && context.sessionCookie) {
    headers["Cookie"] = context.sessionCookie;
  }

  const fetchOpts = { method, headers };
  if (method !== "GET" && method !== "DELETE") {
    fetchOpts.body = JSON.stringify(remaining);
  } else if (Object.keys(remaining).length > 0 && method === "GET") {
    const qs = new URLSearchParams(remaining).toString();
    fetchOpts.url = url + "?" + qs;
  }

  const finalUrl = fetchOpts.url || url;
  let res;
  try {
    res = await fetch(finalUrl, fetchOpts);
  } catch (error) {
    throw new BackendError(`Network error connecting to backend: ${error.message}`, 502, { error: error.message });
  }

  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!res.ok) {
    throw new BackendError(`Backend returned ${res.status}`, res.status, body);
  }
  return body;
}
