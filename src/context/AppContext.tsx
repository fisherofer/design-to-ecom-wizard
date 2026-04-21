import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api, type SystemStatus, type EngineId } from "@/lib/api";

interface AppContextValue {
  status: SystemStatus | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  activeEngine: EngineId;
  setActiveEngine: (e: EngineId) => void;
  chatOpen: boolean;
  setChatOpen: (b: boolean) => void;
  chatTransparent: boolean;
  setChatTransparent: (b: boolean) => void;
  /** 0 = invisible, 100 = fully solid */
  chatOpacity: number;
  setChatOpacity: (n: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeEngine, setActiveEngine] = useState<EngineId>("gemini");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTransparent, setChatTransparent] = useState(false);
  const [chatOpacity, setChatOpacityState] = useState<number>(() => {
    if (typeof window === "undefined") return 90;
    const saved = window.localStorage.getItem("chatOpacity");
    const n = saved ? Number(saved) : 90;
    return Number.isFinite(n) ? Math.min(100, Math.max(5, n)) : 90;
  });

  const setChatOpacity = useCallback((n: number) => {
    const clamped = Math.min(100, Math.max(5, Math.round(n)));
    setChatOpacityState(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chatOpacity", String(clamped));
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await api.systemStatus());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <AppContext.Provider
      value={{
        status,
        refreshing,
        refresh,
        activeEngine,
        setActiveEngine,
        chatOpen,
        setChatOpen,
        chatTransparent,
        setChatTransparent,
        chatOpacity,
        setChatOpacity,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside <AppProvider>");
  return ctx;
}
