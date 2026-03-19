import { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/correction/", "/story/", "/assembly/"],
        disallow: ["/api/", "/#"],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
