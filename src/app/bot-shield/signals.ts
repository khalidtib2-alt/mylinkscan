export type Signal = { label: string; detail: string; penalty: number };
export type BotReport = { signals: Signal[] };

export function userAgentSignal(value: string): Signal {
  const match = value.match(/curl|python|scrapy|wget|headless|bot\b|spider/i);
  return { label: "User-Agent", detail: match ? "Automation marker: " + match[0] : value ? "No listed automation marker" : "Unavailable", penalty: match ? 65 : 0 };
}

export function scoreSignals(signals: Signal[]) {
  const score = Math.max(0, 100 - signals.reduce((sum, signal) => sum + signal.penalty, 0));
  return { score, verdict: score <= 40 ? "Bot or Datacenter" : score < 80 ? "Suspicious" : "Human" };
}
