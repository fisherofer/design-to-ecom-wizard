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
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeEngine, setActiveEngine] = useState<EngineId>("gemini");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTransparent, setChatTransparent] = useState(false);

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
