import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { initPortableStorage } from "@/lib/portableStorage";


import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary text-glow">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Signal Lost</h2>
        <p className="mt-2 text-sm text-muted-foreground font-mono">
          The route you're looking for is offline.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0e1a" },
      { name: "color-scheme", content: "dark" },
      { name: "application-name", content: "AI Executive OS" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "AI Executive OS" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { name: "msapplication-TileColor", content: "#0a0e1a" },
      { title: "AI Executive OS — Algorithmic Trading Dashboard" },
      {
        name: "description",
        content:
          "Production-grade AI command center for algorithmic trading. Local-first execution with cloud failover.",
      },
      { name: "author", content: "Ofer Trading Bot" },
      { property: "og:title", content: "AI Executive OS — Algorithmic Trading Dashboard" },
      { property: "og:description", content: "AI Executive OS & Algorithmic Trading Dashboard for local use." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AI Executive OS — Algorithmic Trading Dashboard" },
      { name: "description", content: "AI Executive OS & Algorithmic Trading Dashboard for local use." },
      { name: "twitter:description", content: "AI Executive OS & Algorithmic Trading Dashboard for local use." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3fcbbed6-05dd-4740-9bca-28c2fcecf3ba/id-preview-c8802216--07243949-5bb1-4142-9dfe-fdfb72c02bb6.lovable.app-1776780334954.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3fcbbed6-05dd-4740-9bca-28c2fcecf3ba/id-preview-c8802216--07243949-5bb1-4142-9dfe-fdfb72c02bb6.lovable.app-1776780334954.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "mask-icon", href: "/apple-touch-icon.png", color: "#0a0e1a" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Hydrate the portable (desktop SQLite) store once, before any tab reads it.
  useEffect(() => {
    void initPortableStorage();
  }, []);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

