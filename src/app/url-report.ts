export type UrlHop = {
  url: string;
  addresses: string[];
  status?: number;
  https: "Verified TLS" | "HTTP only for this hop" | "TLS unverified" |
    "Verified TLS available (HTTP response)" | "TLS unverified (HTTP response)";
};

export type UrlReport = {
  verdict: "Safe" | "Caution" | "High Risk";
  finalUrl: string | null;
  hops: UrlHop[];
  feed: "URL match" | "Hostname match" | "No match" | "Unavailable";
  findings: string[];
  issue?: string;
};
