import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { APP_NAME, APP_TAGLINE } from '@/lib/config/constants';

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description:
    'Eden is an execution-first AI operating system: it turns intent into governed, traceable, optionally-deployable work.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500&family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  );
}
