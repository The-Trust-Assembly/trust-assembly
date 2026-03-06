import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Trust Assembly",
  description:
    "A civic deliberation platform where truth is the only thing that survives adversarial review.",
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
