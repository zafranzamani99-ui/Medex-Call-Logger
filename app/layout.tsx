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
  title: "Medex Workspace",
  description: "Medex Workspace — Internal operations platform",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${ibmPlexSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="theme-color" content="#0b0d14" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            let t = localStorage.getItem('medex-ws-theme');
            if (!t) { t = localStorage.getItem('medex-theme'); if (t) { localStorage.setItem('medex-ws-theme', t); localStorage.removeItem('medex-theme'); } }
            if (t === 'light' || t === 'dark') {
              document.documentElement.setAttribute('data-theme', t);
              var m = document.querySelector('meta[name="theme-color"]:not([media])');
              if (!m) { m = document.createElement('meta'); m.setAttribute('name','theme-color'); document.head.appendChild(m); }
              m.setAttribute('content', t === 'light' ? '#f6f7fb' : '#0b0d14');
            }
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
