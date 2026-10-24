import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// DM Serif Display ships in one weight only; headings use it at 400 like the prototype.
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
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
      className={`${jakarta.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="relative isolate flex min-h-full flex-col bg-surface font-sans text-ink">
        {/* Fixed layer rather than background-attachment: fixed, which iOS Safari ignores. */}
        <div aria-hidden="true" className="bg-mf-page fixed inset-0 -z-10" />
        {children}
      </body>
    </html>
  );
}
