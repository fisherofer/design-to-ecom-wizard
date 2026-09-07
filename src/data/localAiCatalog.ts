/**
 * Local AI catalog — imported from the legacy OFERTRADINGBOT configuration
 * (src/data/localAiConfig.ts + src/lib/dynamicModelsStore.ts in the old system).
 *
 * Pure configuration data: token-priority hierarchy (local → PC → cloud),
 * the curated local model catalog and the cloud fallback catalog.
 * Nothing here performs I/O; runtime installation state comes from the local
 * hub (`/api/local-ai/models`).
 */

export type TierId = "LOCAL_AI" | "PC_AI" | "EXTERNAL_API";

export interface TokenPriorityTier {
  tier: 1 | 2 | 3;
  id: TierId;
  nameHe: string;
  nameEn: string;
  costPer1kTokens: number;
  privacy: "MAXIMAL_SOVEREIGNTY" | "HIGH_LOCAL_PC" | "MANAGED_CLOUD";
  latency: "ULTRA_LOW_0MS" | "HARDWARE_ACCEL_5MS" | "CLOUD_NETWORK_150MS";
  descriptionHe: string;
  useCases: string[];
  isPrimary: boolean;
}

export const TOKEN_PRIORITY_HIERARCHY: TokenPriorityTier[] = [
  {
    tier: 1,
    id: "LOCAL_AI",
    nameHe: "דרג 1: AI מקומי (Ollama / vLLM)",
    nameEn: "Tier 1: Sovereign Local AI",
    costPer1kTokens: 0,
    privacy: "MAXIMAL_SOVEREIGNTY",
    latency: "ULTRA_LOW_0MS",
    descriptionHe:
      "עדיפות ראשונה. ריצה מקומית מלאה ללא עלות טוקנים, ללא מגבלות קצב, אפס שיהוי רשת ופרטיות מוחלטת של אסטרטגיות המסחר.",
    useCases: [
      "סריקות שוטפות של טיקרים ונרות 5 דקות",
      "ניתוח AST של קוד ואופטימיזציית אלגוריתמים",
      "חישובי קוואנט והסתברות",
    ],
    isPrimary: true,
  },
  {
    tier: 2,
    id: "PC_AI",
    nameHe: "דרג 2: האצת חומרה במחשב (GPU/NPU Offload)",
    nameEn: "Tier 2: On-Device PC Acceleration",
    costPer1kTokens: 0,
    privacy: "HIGH_LOCAL_PC",
    latency: "HARDWARE_ACCEL_5MS",
    descriptionHe:
      "עדיפות שנייה. פריקת שכבות לכרטיס המסך (CUDA/Metal) ול-NPU לביצועי 80+ טוקנים לשנייה וחלון הקשר עד 128K.",
    useCases: [
      "מודלים כבדים (14B-32B) עם פריקת שכבות ל-VRAM",
      "ניתוח מקבילי של דוחות כספיים וטפסי SEC",
      "אימון והתאמת משקולות סוכנים (LoRA)",
    ],
    isPrimary: false,
  },
  {
    tier: 3,
    id: "EXTERNAL_API",
    nameHe: "דרג 3: ענן חיצוני מבוקר (Failover בלבד)",
    nameEn: "Tier 3: External Managed Cloud API",
    costPer1kTokens: 0.00015,
    privacy: "MANAGED_CLOUD",
    latency: "CLOUD_NETWORK_150MS",
    descriptionHe:
      "עדיפות שלישית. גיבוי ענן בלבד — מופעל כשהשרת המקומי מנותק או במשימות מולטי-מודאליות חריגות.",
    useCases: [
      "גיבוי אוטומטי כשהשרת המקומי אינו מגיב",
      "עיבוד תמונות וגרפים ויזואליים כבדים",
      "אימות הצלבה חיצוני להחלטות קריטיות",
    ],
    isPrimary: false,
  },
];

export interface LocalAiModel {
  id: string;
  name: string;
  parameterSize: string;
  quantization: "Q4_K_M" | "Q5_K_M" | "Q8_0" | "FP16";
  contextWindow: number;
  recommendedGpuLayers: number;
  runtime: "Ollama" | "LM Studio" | "vLLM" | "Local Transformers";
  descriptionHe: string;
  benchmarkTps: number;
  fitScoreForTrading: number;
}

export const LOCAL_MODEL_CATALOG: LocalAiModel[] = [
  {
    id: "deepseek-r1:8b",
    name: "DeepSeek-R1 Distill Llama 8B",
    parameterSize: "8B",
    quantization: "Q4_K_M",
    contextWindow: 65536,
    recommendedGpuLayers: 33,
    runtime: "Ollama",
    descriptionHe: "חשיבה והיסק מתמטי עמוק. מצטיין בקוואנט, אופטימיזציית AST ואימות סיכונים.",
    benchmarkTps: 48.5,
    fitScoreForTrading: 98,
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B Instruct",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    contextWindow: 32768,
    recommendedGpuLayers: 33,
    runtime: "Ollama",
    descriptionHe: "מומחה שכתוב קוד, ניפוי שגיאות ושיפור ביצועי שרת Node/Python.",
    benchmarkTps: 52,
    fitScoreForTrading: 96,
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B Fast Instruct",
    parameterSize: "3B",
    quantization: "Q4_K_M",
    contextWindow: 131072,
    recommendedGpuLayers: 28,
    runtime: "Ollama",
    descriptionHe: "אולטרה-מהיר לשיהוי אפסי — סריקות טיקרים בזמן אמת.",
    benchmarkTps: 86.4,
    fitScoreForTrading: 92,
  },
  {
    id: "llama3.2:1b",
    name: "Llama 3.2 1B Router",
    parameterSize: "1B",
    quantization: "Q4_K_M",
    contextWindow: 131072,
    recommendedGpuLayers: 24,
    runtime: "Ollama",
    descriptionHe: "ראוטר חזית מהיר: טריאז', ניתוב משימות, סנטימנט פשוט וניטור מערכת.",
    benchmarkTps: 120,
    fitScoreForTrading: 78,
  },
  {
    id: "mistral-nemo:12b",
    name: "Mistral NeMo 12B 128K",
    parameterSize: "12B",
    quantization: "Q4_K_M",
    contextWindow: 131072,
    recommendedGpuLayers: 36,
    runtime: "Ollama",
    descriptionHe: "רב-לשוני עם חלון הקשר ענק לניתוח מאות דוחות וטפסי SEC במקביל.",
    benchmarkTps: 34.2,
    fitScoreForTrading: 94,
  },
  {
    id: "phi4:14b",
    name: "Microsoft Phi-4 14B Reasoning",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    contextWindow: 16384,
    recommendedGpuLayers: 40,
    runtime: "LM Studio",
    descriptionHe: "דיוק מתמטי גבוה ואימות היקשים לוגיים של אסטרטגיות מורכבות.",
    benchmarkTps: 28,
    fitScoreForTrading: 95,
  },
  {
    id: "gemma2:9b",
    name: "Google Gemma 2 9B Instruct",
    parameterSize: "9B",
    quantization: "Q4_K_M",
    contextWindow: 8192,
    recommendedGpuLayers: 33,
    runtime: "Ollama",
    descriptionHe: "ניתוח סנטימנט, חילוץ עובדות מכתבות פיננסיות וסינון שמועות.",
    benchmarkTps: 44,
    fitScoreForTrading: 93,
  },
  {
    id: "deepseek-coder:6.7b",
    name: "DeepSeek Coder 6.7B",
    parameterSize: "6.7B",
    quantization: "Q4_K_M",
    contextWindow: 16384,
    recommendedGpuLayers: 32,
    runtime: "Ollama",
    descriptionHe: "השלמת קוד ותיקוני באגים מקומיים לצוות ה-self-coding.",
    benchmarkTps: 55,
    fitScoreForTrading: 88,
  },
];

export interface CloudModelEntry {
  id: string;
  name: string;
  vendor: string;
  useCase: string;
  recommendation: string;
  tags: string[];
}

/** Cloud fallback catalog (tier 3). Ids are vendor-native, used by the router UI. */
export const CLOUD_MODEL_CATALOG: CloudModelEntry[] = [
  {
    id: "google/gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    vendor: "Google",
    useCase: "ניתוח מהיר, סיכומים, ניתוב סוכנים",
    recommendation: "ברירת המחדל לענן — מהיר וזול יחסית.",
    tags: ["cloud", "fast", "default"],
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    vendor: "Google",
    useCase: "ניתוח יסודות עמוק, סריקת PDF, מולטי-מודאלי",
    recommendation: "כשנדרשת איכות מעל מהירות.",
    tags: ["cloud", "reasoning", "heavy"],
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    vendor: "OpenAI",
    useCase: "קוד, ארכיטקטורה, תכנון מורכב",
    recommendation: "לסוכן ה-self-coding והמבקר הראשי.",
    tags: ["cloud", "coding", "expert"],
  },
  {
    id: "openai/gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    vendor: "OpenAI",
    useCase: "סיווג, חילוץ נתונים, דירוג בנפח גבוה",
    recommendation: "לעבודות מסיביות בעלות נמוכה.",
    tags: ["cloud", "cheap", "bulk"],
  },
];

export interface LocalAiRuntimeSettings {
  activeProvider: "Ollama" | "LM Studio" | "vLLM" | "Custom Endpoint";
  endpointUrl: string;
  selectedModelId: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  gpuOffloadLayers: number;
  threads: number;
  fallbackToCloud: boolean;
  cloudFallbackModelId: string;
}

export const DEFAULT_LOCAL_AI_SETTINGS: LocalAiRuntimeSettings = {
  activeProvider: "Ollama",
  endpointUrl: "http://127.0.0.1:11434",
  selectedModelId: "deepseek-r1:8b",
  temperature: 0.1,
  maxTokens: 4096,
  contextWindow: 32768,
  gpuOffloadLayers: 33,
  threads: 8,
  fallbackToCloud: true,
  cloudFallbackModelId: "google/gemini-3.7-flash",
};

const SETTINGS_KEY = "ai-os.localAi.runtime.v1";

export function getLocalAiSettings(): LocalAiRuntimeSettings {
  if (typeof localStorage === "undefined") return DEFAULT_LOCAL_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_LOCAL_AI_SETTINGS, ...(JSON.parse(raw) as object) } : DEFAULT_LOCAL_AI_SETTINGS;
  } catch {
    return DEFAULT_LOCAL_AI_SETTINGS;
  }
}

export function setLocalAiSettings(patch: Partial<LocalAiRuntimeSettings>): LocalAiRuntimeSettings {
  const next = { ...getLocalAiSettings(), ...patch };
  if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
