/**
 * Same-origin proxy for the preview API.
 * The separate Pages preview project has a default Render service.
 * Other deployments require an explicit API_ORIGIN environment variable.
 * The /api prefix is stripped before forwarding to Fastify.
 */
export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const previewOrigin = incoming.hostname === "waqar-al-anabi-preview.pages.dev"
    ? "https://waqar-al-anabi-preview-api.onrender.com"
    : undefined;
  const configuredOrigin = context.env.API_ORIGIN || previewOrigin;
  if (!configuredOrigin) {
    return Response.json(
      { error: "API_NOT_CONFIGURED", message: "The preview API has not been connected yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let upstream;
  try {
    upstream = new URL(configuredOrigin);
    if (upstream.protocol !== "https:") throw new Error("HTTPS is required");
  } catch {
    return Response.json(
      { error: "API_CONFIGURATION_INVALID", message: "The preview API configuration is invalid." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const suffix = incoming.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  upstream.pathname = suffix;
  upstream.search = incoming.search;

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
  }

  try {
    const response = await fetch(new Request(upstream.toString(), init));
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "API_UNAVAILABLE", message: "The preview API is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
