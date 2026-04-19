import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { StatusBar } from "./StatusBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="relative flex-1 overflow-y-auto">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 grid-bg opacity-40" />
          <div className="relative">{children}</div>
        </main>
        <StatusBar />
      </div>
    </div>
  );
}
