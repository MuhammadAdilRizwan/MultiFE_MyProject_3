import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "MultiFe — Made-to-measure, delivered",
    template: "%s · MultiFe",
  },
  description:
    "MultiFe pairs trusted fabric brands with AI-powered sizing and our own tailoring workshop, so you get a garment made exactly for you — no shop visit required.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8fcff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="relative isolate flex min-h-full flex-col bg-surface font-sans text-ink">
        {/* Fixed layer rather than background-attachment: fixed, which iOS Safari ignores. */}
        <div aria-hidden="true" className="bg-mf-page fixed inset-0 -z-10" />
        {children}
      </body>
    </html>
  );
}
