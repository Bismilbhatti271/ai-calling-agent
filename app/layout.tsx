import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import { NotificationsProvider } from '@/lib/notifications-context'
import { TicketsProvider } from '@/lib/tickets-context'
import './globals.css'

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken-grotesk',
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['100', '200', '300', '400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'Empire-X AI Calling Platform',
  description: 'Enterprise AI voice calling platform',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#131313',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${hankenGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased font-sans">
        <AuthProvider>
          <NotificationsProvider>
            <TicketsProvider>
              {children}
            </TicketsProvider>
          </NotificationsProvider>
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
