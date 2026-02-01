import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Real-time STT Evaluation",
  description: "Compare multiple Speech-to-Text APIs in real-time",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexClientProvider>{children}</ConvexClientProvider>

        {/* WUUNU SNIPPET - DON'T CHANGE THIS (START) */}
        {process.env.NODE_ENV !== "production" && (
          <>
            <Script id="wuunu-ws" strategy="afterInteractive">
              {`window.__WUUNU_WS__ = "http://127.0.0.1:49944/?token=55b55516c142907c886fc418b126b0a90affa828b759227f";`}
            </Script>
            <Script
              id="wuunu-widget"
              src="https://cdn.jsdelivr.net/npm/@wuunu/widget@0.1.20"
              strategy="afterInteractive"
              crossOrigin="anonymous"
            />
          </>
        )}
        {/* WUUNU SNIPPET - DON'T CHANGE THIS (END) */}
      </body>
    </html>
  );
}
