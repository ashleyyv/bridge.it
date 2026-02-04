import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bridge.it | Institutional Opportunity Engine",
  description: "Pursuit Staff Portal - Hospitality Vertical",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background">
        {children}
      </body>
    </html>
  );
}
