import type { MetadataRoute } from "next";
import { siteUrl, trustLinks } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...trustLinks.map(({ href }) => href)].map((path) => ({
    url: new URL(path, siteUrl).href,
  }));
}
