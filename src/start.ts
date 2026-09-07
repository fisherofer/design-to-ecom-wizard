/**
 * Server hardening — every document/response leaves with defensive headers.
 * Frame embedding is allowed only for the Lovable preview host chain.
 */
import { createStart, createMiddleware } from "@tanstack/react-start";

const securityHeaders = createMiddleware({ type: "request" }).server(async ({ next }) => {
  const result = await next();
  const h = result.response.headers;
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  h.set("cross-origin-opener-policy", "same-origin-allow-popups");
  h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  h.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.gpteng.co https://*.lovable.dev",
      // The local hub / Ollama / LM Studio run on loopback when the system is self-hosted.
      "connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
      "worker-src 'self' blob:",
    ].join("; "),
  );
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}));
