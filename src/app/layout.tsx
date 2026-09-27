import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { ThemedToaster } from "@/components/themed-toaster";

// Runs synchronously before hydration/paint — reads the persisted theme
// choice and sets data-theme immediately, so a light/system-light user
// never sees a flash of the dark theme while React boots up. Kept as a
// plain string (not a separate file) since Next inlines it verbatim via
// dangerouslySetInnerHTML; matches how zustand's persist middleware names
// and shapes its localStorage entry (src/lib/theme-store.ts).
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem("keepyourstack-theme");
    var theme = raw ? JSON.parse(raw).state.theme : "dark";
    if (theme !== "light" && theme !== "system" && theme !== "dark") theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://keep-your-stack.vercel.app"),
  title: "KeepYourStack",
  description: "A personal toolbox for building on the internet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jbmono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background">
        <ThemeProvider />
        <AnalyticsTracker />
        {children}
        <ThemedToaster />
      </body>
    </html>
  );
}
