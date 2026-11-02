import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { Toaster } from "@juryza/ui/components/ui/sonner";
import { TooltipProvider } from "@juryza/ui/components/ui/tooltip";
import { ThemeProvider } from "@juryza/ui/theme/theme";

import { LocaleProvider } from "@/components/locale-provider";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { QueryProvider } from "@/lib/query-client";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Innovation Lab", template: "%s · Innovation Lab" },
  description:
    "Plateforme interne pour préparer, conduire et évaluer les événements Innovation Lab.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const storedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange>
          <LocaleProvider initialLocale={locale}>
            <QueryProvider>
              <TooltipProvider delay={200}>{children}</TooltipProvider>
              <Toaster richColors position="bottom-right" />
            </QueryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
