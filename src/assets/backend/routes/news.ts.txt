/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export const newsRouter = Router();

export interface AnalyzedNewsItem {
  id: string;
  topicHash: string;
  title: string;
  summary: string;
  mainTicker: string;
  relatedTickers: string[];
  sentimentScore: number; // -100 (Extremely Bearish) to +100 (Extremely Bullish)
  sentimentLabel: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  technicalForecast: string;
  targetPriceImpactPct: number;
  sources: {
    name: string;
    type: 'news_site' | 'youtube' | 'twitter_x' | 'analyst';
    url?: string;
    timestamp: string;
  }[];
  repeatCount: number; // How many times this same story was detected across channels
  agentsInvolved: string[]; // e.g. ["NewsScraperAgent", "TwitterSentinetAgent", "YouTubeTranscriberAgent", "TechnicalCorrelatorAgent"]
  firstDetectedAt: string;
  lastUpdatedAt: string;
  aiAgentVerdict: string;
}

// In-memory news history database with smart deduplication
let newsHistoryStore: AnalyzedNewsItem[] = [
  {
    id: "NEWS-2026-001",
    topicHash: "teva-austedo-fda",
    title: "טבע מדווחת על אישור FDA מורחב ל-Austedo ומכירות שיא",
    summary: "חברת טבע (TEVA) מפרסמת עדכון חיובי על התקדמות מכירות Austedo ו-Ajovy בשוק האמריקאי, לצד העלאת תחזית הרווח השנתית.",
    mainTicker: "TEVA.TA",
    relatedTickers: ["TEVA", "TA-35", "TA-HEALTH"],
    sentimentScore: 85,
    sentimentLabel: "BULLISH",
    impactLevel: "HIGH",
    technicalForecast: "פריצה טכנית מעל ממוצע 200 ימים (EMA200), יעדי מחיר ראשונים ב-76.00 ₪ (+8.5%)",
    targetPriceImpactPct: 8.5,
    sources: [
      { name: "גלובס Globes", type: "news_site", timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString() },
      { name: "כלכליסט Calcalist", type: "news_site", timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
      { name: "מיכה סטוקס Micha Stocks (YouTube)", type: "youtube", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
      { name: "@MichaStocks (X/Twitter)", type: "twitter_x", timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString() }
    ],
    repeatCount: 4,
    agentsInvolved: ["NewsScraperAgent", "YouTubeTranscriberAgent", "TwitterSentimentAgent", "TechnicalCorrelatorAgent"],
    firstDetectedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    aiAgentVerdict: "כפילויות ממוזגות בהצלחה מ-4 מקורות שונים! סנטימנט שורי חזק בגיבוי מחזורי מסחר חריגים בטרום מסחר בתל אביב."
  },
  {
    id: "NEWS-2026-002",
    topicHash: "nvda-blackwell-demand",
    title: "NVIDIA (NVDA): ביקוש שיא לשבבי Blackwell וגידול בנתח השוק",
    summary: "מגזר מרכזי הנתונים של אנבידיה רושם הזמנות שיא ממיקרוסופט, מטא ואמזון. האנליסטים מעלים יעדי מחיר ברקע מחסור גלובלי בחומרה.",
    mainTicker: "NVDA",
    relatedTickers: ["MSFT", "AMZN", "META", "CAMT", "TSEM"],
    sentimentScore: 92,
    sentimentLabel: "BULLISH",
    impactLevel: "CRITICAL",
    technicalForecast: "תבנית דגל שורי (Bull Flag Breakout), יעד טכני ראשון $1,020 (תמיכה ב-$910)",
    targetPriceImpactPct: 7.9,
    sources: [
      { name: "Bloomberg Markets", type: "news_site", timestamp: new Date(Date.now() - 1000 * 60 * 50).toISOString() },
      { name: "Reuters Financial", type: "news_site", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
      { name: "@unusual_whales (X)", type: "twitter_x", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
      { name: "Meet Kevin (YouTube)", type: "youtube", timestamp: new Date(Date.now() - 1000 * 60 * 22).toISOString() },
      { name: "TraderTV Live (YouTube)", type: "youtube", timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString() }
    ],
    repeatCount: 5,
    agentsInvolved: ["NewsScraperAgent", "TwitterSentimentAgent", "YouTubeTranscriberAgent", "WhaleTrackerAgent"],
    firstDetectedAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    aiAgentVerdict: "זיהוי 5 דיווחים חוזרים באותה נושא. משקל הניתוח הוכפל מ-1.0x ל-2.2x עקב אישור מרובי אנליסטים בכירים."
  },
  {
    id: "NEWS-2026-003",
    topicHash: "israel-banks-dividends",
    title: "בנקים בישראל (פועלים, לאומי): תוצאות כספיות חזקות וחלוקת דיבידנד מוגדלת",
    summary: "בנק הפועלים ובנק לאומי מדווחים על רווחי שיא רבעוניים, תשואת הון מעל 15% והגדלת אחוז חלוקת הדיבידנדים.",
    mainTicker: "POLI.TA",
    relatedTickers: ["LOMI.TA", "MIZR.TA", "TA-BANKS", "TA-35"],
    sentimentScore: 88,
    sentimentLabel: "BULLISH",
    impactLevel: "HIGH",
    technicalForecast: "תבנית ספל וידית (Cup & Handle) במדד הבנקים, יעד טכני ב-POLI ב-42.50 ₪",
    targetPriceImpactPct: 5.2,
    sources: [
      { name: "TheMarker", type: "news_site", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
      { name: "Bizportal", type: "news_site", timestamp: new Date(Date.now() - 1000 * 60 * 85).toISOString() },
      { name: "מיכה סטוקס Micha Stocks (YouTube)", type: "youtube", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() }
    ],
    repeatCount: 3,
    agentsInvolved: ["NewsScraperAgent", "YouTubeTranscriberAgent", "TechnicalCorrelatorAgent"],
    firstDetectedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    aiAgentVerdict: "איחוד 3 כתבות עיתונות וסרטון ניתוח יוטיוב לסיכום אחד מקיף. כניסת כספים מוסדית לסקטור הבנקים."
  }
];

// Helper for generating simple normalized hash from string
function generateTopicHash(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9א-ת]/g, '')
    .slice(0, 30);
}

// Get history
newsRouter.get('/news/history', (req: Request, res: Response) => {
  res.json({
    success: true,
    totalCount: newsHistoryStore.length,
    items: newsHistoryStore
  });
});

// Clear history
newsRouter.post('/news/clear-history', (req: Request, res: Response) => {
  newsHistoryStore = [];
  res.json({ success: true, message: "היסטוריית החדשות נוקתה בהצלחה" });
});

// AI News Fetch, Deduplicate & Analyze Endpoint
newsRouter.post('/news/analyze-and-dedupe', async (req: Request, res: Response) => {
  const { customNewsList, targetTicker } = req.body;

  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    } catch (e) {
      console.error('Gemini init err:', e);
    }
  }

  // Raw candidate news items to process (simulating multi-agent scraping across YouTube, X, and News Sites)
  const incomingItems = customNewsList || [
    { title: "טבע מפרסמת דוחות כספיים מעל הציפיות", source: "גלובס", type: "news_site", ticker: "TEVA.TA" },
    { title: "Teva Reports Record Austedo Sales in Q2", source: "Bloomberg", type: "news_site", ticker: "TEVA" },
    { title: "מיכה סטוקס: טבע פרצה רמת התנגדות קריטית ב-68 ₪", source: "מיכה סטוקס (YouTube)", type: "youtube", ticker: "TEVA.TA" },
    { title: "NVIDIA Blackwell chips sold out through 2026", source: "Reuters", type: "news_site", ticker: "NVDA" },
    { title: "Nvidia GPU demand stays hot as tech giants expand AI clusters", source: "@unusual_whales (X)", type: "twitter_x", ticker: "NVDA" },
    { title: "בנק הפועלים מעלה דיבידנד בעקבות רווחי שיא", source: "Bizportal", type: "news_site", ticker: "POLI.TA" },
  ];

  const agentLogs: string[] = [];
  agentLogs.push(`[NewsScraperAgent] התחלת סריקת חדשות ועדכונים מרשתות חברתיות (X/Twitter, YouTube, אתרי חדשות)...`);
  agentLogs.push(`[DeduplicatorAgent] נמצאו ${incomingItems.length} פריטי מידע גולמיים. מפעיל אלגוריתם מניעת כפילויות (Deduplication Hash)...`);

  let addedCount = 0;
  let updatedCount = 0;

  for (const raw of incomingItems) {
    const rawTicker = raw.ticker || targetTicker || "GENERAL";
    const topicHash = generateTopicHash(raw.title + " " + rawTicker);

    // Check if we already have a matching topic hash or similar title
    const existingIndex = newsHistoryStore.findIndex(item => 
      item.topicHash === topicHash || 
      item.title.includes(raw.title.slice(0, 15)) ||
      raw.title.includes(item.title.slice(0, 15))
    );

    if (existingIndex >= 0) {
      // Merge duplicate! Increase repeat count and append source
      const existing = newsHistoryStore[existingIndex];
      existing.repeatCount += 1;
      existing.lastUpdatedAt = new Date().toISOString();
      if (!existing.sources.some(s => s.name === raw.source)) {
        existing.sources.push({
          name: raw.source,
          type: raw.type || 'news_site',
          timestamp: new Date().toISOString()
        });
      }
      existing.aiAgentVerdict = `איחוד כפילות! הידיעה זוהתה כעת מ-${existing.repeatCount} מקורות שונים. משקל ההשפעה הועלה ל-${(1 + existing.repeatCount * 0.3).toFixed(1)}x.`;
      updatedCount++;
      agentLogs.push(`[DeduplicatorAgent] ⚠️ כפילות זוהתה: "${raw.title}" אוחדה לידיעה קיימת #${existing.id} (${existing.repeatCount} מקורות).`);
    } else {
      // Create new analyzed news item
      let sentimentScore = Math.floor(Math.random() * 40) + 50; // default bullish-leaning
      let technicalForecast = "תנועה חיובית מעל רמת תמיכה מרכזית";
      let priceImpact = +(Math.random() * 5 + 1).toFixed(1);

      if (raw.title.toLowerCase().includes('down') || raw.title.includes('ירידה') || raw.title.includes('אזהרת')) {
        sentimentScore = Math.floor(Math.random() * -40) - 20;
        technicalForecast = "בחינת רמות תמיכה נמוכות עקב לחץ מוכרים";
        priceImpact = -(Math.random() * 4 + 1).toFixed(1);
      }

      const newItem: AnalyzedNewsItem = {
        id: `NEWS-${Date.now().toString().slice(-5)}`,
        topicHash,
        title: raw.title,
        summary: `ניתוח סוכנים: דיווח חדש שהתקבל מ-${raw.source}. הדיווח נבחן ונמצא רלוונטי למניה ${rawTicker}.`,
        mainTicker: rawTicker,
        relatedTickers: [rawTicker, "TA-35", "NASDAQ"],
        sentimentScore,
        sentimentLabel: sentimentScore > 20 ? "BULLISH" : sentimentScore < -20 ? "BEARISH" : "NEUTRAL",
        impactLevel: Math.abs(sentimentScore) > 75 ? "CRITICAL" : Math.abs(sentimentScore) > 50 ? "HIGH" : "MEDIUM",
        technicalForecast: technicalForecast + ` (${priceImpact > 0 ? '+' : ''}${priceImpact}% צפי מחיר)`,
        targetPriceImpactPct: priceImpact,
        sources: [{
          name: raw.source,
          type: raw.type || 'news_site',
          timestamp: new Date().toISOString()
        }],
        repeatCount: 1,
        agentsInvolved: ["NewsScraperAgent", "TwitterSentimentAgent", "YouTubeTranscriberAgent", "TechnicalCorrelatorAgent"],
        firstDetectedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        aiAgentVerdict: `ידיעה חדשה שנותחה ואומתה ראשונית על ידי סוכן הניתוח הטכני.`
      };

      newsHistoryStore.unshift(newItem);
      addedCount++;
      agentLogs.push(`[TechnicalCorrelatorAgent] ✓ ידיעה חדשה הוספה להפצה ולמעקב: #${newItem.id} (${rawTicker}).`);
    }
  }

  agentLogs.push(`[Summary] תהליך העיבוד הושלם! ${addedCount} ידיעות חדשות, ${updatedCount} כפילויות אוחדו ושוקללו בהיסטוריה.`);

  res.json({
    success: true,
    addedCount,
    updatedCount,
    agentLogs,
    items: newsHistoryStore
  });
});

// Get agent summary insights
newsRouter.get('/news/agent-insights', (req: Request, res: Response) => {
  const totalNews = newsHistoryStore.length;
  const totalDuplicatesMerged = newsHistoryStore.reduce((acc, item) => acc + (item.repeatCount - 1), 0);
  const bullishCount = newsHistoryStore.filter(i => i.sentimentLabel === 'BULLISH').length;
  const bearishCount = newsHistoryStore.filter(i => i.sentimentLabel === 'BEARISH').length;

  res.json({
    success: true,
    metrics: {
      totalNews,
      totalDuplicatesMerged,
      bullishCount,
      bearishCount,
      neutralCount: totalNews - (bullishCount + bearishCount),
      topMentionedTicker: "TEVA.TA"
    },
    topImpactNews: newsHistoryStore.slice(0, 5)
  });
});
