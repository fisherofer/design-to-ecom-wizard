// Path: src/services/api.ts
// Role: Core API Bridge to FastAPI Backend (QuantEngine on :8000)
// Source: Generated per Goose MCP "Frontend Setup Instructions".
// NOTE: This bridge is separate from src/lib/api.ts (which targets the
// AI Executive OS bridge on :8050). Use this client only for the
// QuantEngine trading backend.

import axios, { type AxiosInstance, type AxiosResponse, type AxiosError } from "axios";

const API_BASE_URL =
  (typeof window !== "undefined" && (window as { __QUANT_API_BASE__?: string }).__QUANT_API_BASE__) ||
  "http://localhost:8000";
const MAX_RETRIES = 3;

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || "");
    return config;
  },
  (error: AxiosError) => {
    console.error("[API Request Error]", error.message);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`[API Response] ${response.config.url}`, response.data);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as (typeof error.config & { retryCount?: number }) | undefined;
    if (!config) return Promise.reject(error);

    config.retryCount = config.retryCount ?? 0;
    if (config.retryCount < MAX_RETRIES) {
      config.retryCount += 1;
      console.warn(
        `[API Retry] Retrying ${config.url} (Attempt ${config.retryCount}/${MAX_RETRIES})...`,
      );
      const backoff = new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, (config.retryCount ?? 1) - 1)),
      );
      await backoff;
      return apiClient(config);
    }

    console.error(`[API Final Error] ${config.url} failed after ${MAX_RETRIES} retries.`, error.message);
    return Promise.reject(error);
  },
);

export const HealthService = {
  checkStatus: async () => {
    const response = await apiClient.get("/health");
    return response.data;
  },
};

export const TradingService = {
  executeTrade: async (symbol: string, direction: string, quantity: number, confidence: number) => {
    const response = await apiClient.post("/api/trade", { symbol, direction, quantity, confidence });
    return response.data;
  },
};
