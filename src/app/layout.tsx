import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

export const metadata: Metadata = {
  title: {
    default: "The Trust Assembly",
    template: "%s",
  },
  description:
    "A civic deliberation platform where truth is the only thing that survives adversarial review.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: "website",
    siteName: "The Trust Assembly",
    title: "The Trust Assembly",
    description:
      "A civic deliberation platform where truth is the only thing that survives adversarial review.",
    url: APP_URL,
  },
  twitter: {
    card: "summary",
    title: "The Trust Assembly",
    description:
      "A civic deliberation platform where truth is the only thing that survives adversarial review.",
  },
  alternates: {
    canonical: APP_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
