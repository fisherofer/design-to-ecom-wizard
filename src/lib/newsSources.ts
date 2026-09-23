/**
 * newsSources — the catalogue the vision/news agents read from.
 *
 * Three geographies (global / israel / europe) each carry 20 suggested YouTube
 * channels, plus analyst desks, trading sites and X (Twitter) handles. The lists
 * below are editable DEFAULT SUGGESTIONS only: nothing is fetched until the
 * local browser agent actually reads a source, and a source that cannot be read
 * is reported as unavailable rather than summarised from nothing.
 */
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { useEffect, useState } from "react";

export const SOURCES_KEY = "ofer.newsSources.v1";
export const SOURCES_EVENT = "ofer:news-sources-changed";

export type SourceRegion = "global" | "israel" | "europe";
export type SourceKind = "youtube" | "analyst" | "trading_site" | "x";

export interface NewsSource {
  id: string;
  kind: SourceKind;
  region: SourceRegion;
  name: string;
  url: string;
  enabled: boolean;
  /** Topic tags used by the smart catalogue when routing a story to a segment. */
  tags: string[];
}

const sid = (kind: string, name: string) =>
  `${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

function yt(region: SourceRegion, entries: Array<[string, string]>): NewsSource[] {
  return entries.map(([name, url]) => ({
    id: sid(`yt-${region}`, name),
    kind: "youtube" as const,
    region,
    name,
    url,
    enabled: true,
    tags: ["video", region],
  }));
}

const YT_GLOBAL: Array<[string, string]> = [
  ["Bloomberg Television", "https://www.youtube.com/@markets"],
  ["CNBC", "https://www.youtube.com/@CNBC"],
  ["Yahoo Finance", "https://www.youtube.com/@YahooFinance"],
  ["Reuters", "https://www.youtube.com/@Reuters"],
  ["Wall Street Journal", "https://www.youtube.com/@WSJ"],
  ["Financial Times", "https://www.youtube.com/@FinancialTimes"],
  ["Benzinga", "https://www.youtube.com/@Benzinga"],
  ["Investor's Business Daily", "https://www.youtube.com/@InvestorsBusinessDaily"],
  ["Real Vision", "https://www.youtube.com/@RealVisionFinance"],
  ["Bankless", "https://www.youtube.com/@Bankless"],
  ["Meet Kevin", "https://www.youtube.com/@MeetKevin"],
  ["Tom Nash", "https://www.youtube.com/@TomNash"],
  ["Joseph Carlson", "https://www.youtube.com/@JosephCarlsonShow"],
  ["Patrick Boyle", "https://www.youtube.com/@PBoyle"],
  ["The Plain Bagel", "https://www.youtube.com/@ThePlainBagel"],
  ["New Money", "https://www.youtube.com/@NewMoney"],
  ["Quantopian / QuantPy", "https://www.youtube.com/@QuantPy"],
  ["SMB Capital", "https://www.youtube.com/@smbcapital"],
  ["Trading Nut", "https://www.youtube.com/@TradingNut"],
  ["Interactive Brokers", "https://www.youtube.com/@InteractiveBrokers"],
];

const YT_ISRAEL: Array<[string, string]> = [
  ["כאן חדשות", "https://www.youtube.com/@kann"],
  ["חדשות 12", "https://www.youtube.com/@N12News"],
  ["חדשות 13", "https://www.youtube.com/@13News"],
  ["גלובס", "https://www.youtube.com/@globesnews"],
  ["כלכליסט", "https://www.youtube.com/@Calcalist"],
  ["TheMarker", "https://www.youtube.com/@TheMarkerTV"],
  ["ביזפורטל", "https://www.youtube.com/@Bizportal"],
  ["מאיה - הבורסה לניירות ערך", "https://www.youtube.com/@TASE-IL"],
  ["בנק ישראל", "https://www.youtube.com/@BankOfIsrael"],
  ["רשות ניירות ערך", "https://www.youtube.com/@isa_gov_il"],
  ["מיטב", "https://www.youtube.com/@meitav"],
  ["IBI בית השקעות", "https://www.youtube.com/@IBIinvest"],
  ["אלטשולר שחם", "https://www.youtube.com/@AltshulerShaham"],
  ["פסגות", "https://www.youtube.com/@PsagotInvest"],
  ["הכסף של אנשים", "https://www.youtube.com/@hakesef"],
  ["השקעות בשקל", "https://www.youtube.com/@investinshekel"],
  ["שוק ההון בפשטות", "https://www.youtube.com/@capitalmarket-simple"],
  ["דה מרקר TV שווקים", "https://www.youtube.com/@TheMarkerMarkets"],
  ["אקונומיסט ישראלי", "https://www.youtube.com/@israelieconomist"],
  ["סטארט-אפ ניישן סנטרל", "https://www.youtube.com/@StartupNationCentral"],
];

const YT_EUROPE: Array<[string, string]> = [
  ["Bloomberg UK", "https://www.youtube.com/@BloombergUK"],
  ["Sky News Business", "https://www.youtube.com/@SkyNews"],
  ["BBC News", "https://www.youtube.com/@BBCNews"],
  ["Euronews Business", "https://www.youtube.com/@euronews"],
  ["DW News", "https://www.youtube.com/@dwnews"],
  ["France 24 English", "https://www.youtube.com/@France24_en"],
  ["CNBC International", "https://www.youtube.com/@CNBCi"],
  ["European Central Bank", "https://www.youtube.com/@ecbeuro"],
  ["Bank of England", "https://www.youtube.com/@bankofengland"],
  ["Deutsche Börse", "https://www.youtube.com/@DeutscheBoerseAG"],
  ["Euronext", "https://www.youtube.com/@Euronext"],
  ["London Stock Exchange Group", "https://www.youtube.com/@LSEGplc"],
  ["Handelsblatt", "https://www.youtube.com/@Handelsblatt"],
  ["Finanzfluss", "https://www.youtube.com/@Finanzfluss"],
  ["Mission Money", "https://www.youtube.com/@MissionMoney"],
  ["Boerse.de", "https://www.youtube.com/@boersede"],
  ["IG UK", "https://www.youtube.com/@IGUnitedKingdom"],
  ["Saxo Bank", "https://www.youtube.com/@SaxoBank"],
  ["Hargreaves Lansdown", "https://www.youtube.com/@HargreavesLansdown"],
  ["Investing.com Europe", "https://www.youtube.com/@InvestingcomUK"],
];

const ANALYSTS: NewsSource[] = [
  ["Goldman Sachs Insights", "https://www.goldmansachs.com/insights", "global"],
  ["Morgan Stanley Ideas", "https://www.morganstanley.com/ideas", "global"],
  ["J.P. Morgan Research", "https://www.jpmorgan.com/insights", "global"],
  ["BlackRock Market Commentary", "https://www.blackrock.com/corporate/insights", "global"],
  ["Bank of Israel publications", "https://www.boi.org.il/en/publications/", "israel"],
  ["Leader Capital Markets research", "https://www.leadercm.co.il/", "israel"],
  ["ECB economic bulletin", "https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html", "europe"],
  ["Deutsche Bank Research", "https://www.dbresearch.com/", "europe"],
].map(([name, url, region]) => ({
  id: sid("analyst", name as string),
  kind: "analyst" as const,
  region: region as SourceRegion,
  name: name as string,
  url: url as string,
  enabled: true,
  tags: ["research"],
}));

const TRADING_SITES: NewsSource[] = [
  ["Investing.com", "https://www.investing.com/news/", "global"],
  ["MarketWatch", "https://www.marketwatch.com/", "global"],
  ["Seeking Alpha", "https://seekingalpha.com/market-news", "global"],
  ["Finviz news", "https://finviz.com/news.ashx", "global"],
  ["TradingView news", "https://www.tradingview.com/news/", "global"],
  ["Globes markets", "https://en.globes.co.il/en/", "israel"],
  ["Bizportal", "https://www.bizportal.co.il/", "israel"],
  ["TASE announcements (Maya)", "https://maya.tase.co.il/", "israel"],
  ["Euronext news", "https://live.euronext.com/en/products/equities", "europe"],
  ["Börse Frankfurt", "https://www.boerse-frankfurt.de/en", "europe"],
].map(([name, url, region]) => ({
  id: sid("site", name as string),
  kind: "trading_site" as const,
  region: region as SourceRegion,
  name: name as string,
  url: url as string,
  enabled: true,
  tags: ["news"],
}));

const X_HANDLES: NewsSource[] = [
  ["@DeItaone (Walter Bloomberg)", "https://x.com/DeItaone", "global"],
  ["@FirstSquawk", "https://x.com/FirstSquawk", "global"],
  ["@unusual_whales", "https://x.com/unusual_whales", "global"],
  ["@zerohedge", "https://x.com/zerohedge", "global"],
  ["@LizAnnSonders", "https://x.com/LizAnnSonders", "global"],
  ["@globesnews", "https://x.com/globesnews", "israel"],
  ["@calcalist", "https://x.com/calcalist", "israel"],
  ["@bankofisrael", "https://x.com/bankofisrael", "israel"],
  ["@ecb", "https://x.com/ecb", "europe"],
  ["@FT", "https://x.com/FT", "europe"],
].map(([name, url, region]) => ({
  id: sid("x", name as string),
  kind: "x" as const,
  region: region as SourceRegion,
  name: name as string,
  url: url as string,
  enabled: true,
  tags: ["social"],
}));

export function defaultSources(): NewsSource[] {
  return [
    ...yt("global", YT_GLOBAL),
    ...yt("israel", YT_ISRAEL),
    ...yt("europe", YT_EUROPE),
    ...ANALYSTS,
    ...TRADING_SITES,
    ...X_HANDLES,
  ];
}

function read(): NewsSource[] {
  const stored = portableGetJson<NewsSource[] | null>(SOURCES_KEY, null);
  return stored?.length ? stored : defaultSources();
}

function write(list: NewsSource[]) {
  portableSetJson(SOURCES_KEY, list);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SOURCES_EVENT));
}

export const newsSources = {
  all: read,
  byRegion: (region: SourceRegion) => read().filter((s) => s.region === region),
  byKind: (kind: SourceKind) => read().filter((s) => s.kind === kind),
  enabledUrls: (filter?: { kind?: SourceKind; region?: SourceRegion }) =>
    read()
      .filter((s) => s.enabled)
      .filter((s) => (filter?.kind ? s.kind === filter.kind : true))
      .filter((s) => (filter?.region ? s.region === filter.region : true))
      .map((s) => s.url),
  toggle(sourceId: string) {
    write(read().map((s) => (s.id === sourceId ? { ...s, enabled: !s.enabled } : s)));
  },
  add(input: { name: string; url: string; kind: SourceKind; region: SourceRegion }) {
    const item: NewsSource = {
      id: `${sid(input.kind, input.name)}-${Date.now().toString(36)}`,
      kind: input.kind,
      region: input.region,
      name: input.name.trim(),
      url: input.url.trim(),
      enabled: true,
      tags: [input.kind],
    };
    write([item, ...read()]);
    return item;
  },
  remove(sourceId: string) {
    write(read().filter((s) => s.id !== sourceId));
  },
  reset() {
    write(defaultSources());
  },
};

export function useNewsSources() {
  const [list, setList] = useState<NewsSource[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(SOURCES_EVENT, sync);
    return () => window.removeEventListener(SOURCES_EVENT, sync);
  }, []);
  return list;
}
