import type { Metadata } from "next"
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "@/lib/ThemeProvider"
import "./globals.css"

// WHY: next/font downloads fonts at BUILD TIME and self-hosts them.
// Eliminates render-blocking @import, prevents layout shift (CLS),
// no external network request to Google Fonts on every page load.
// Saves 0.5-1s on first paint vs CSS @import.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
})

// WHY: Root layout wraps the entire app. Metadata sets the page title
// shown in browser tab. No nav bar here — that goes in the (app) protected layout.
export const metadata: Metadata = {
  title: "Medex Call Logger",
  description: "Medex Support Team — Call & WhatsApp Logging System",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${ibmPlexSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('medex-theme');
            if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
          } catch {}
        `}} />
      </head>
      <body className="antialiased min-h-dvh bg-background text-foreground">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
