import type { Metadata } from 'next';
import { Schibsted_Grotesk, Spline_Sans_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import './globals.css';

const grotesk = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
});

const mono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-mono-data',
});

export const metadata: Metadata = {
  title: 'GrowEasy Smart Import',
  description: 'AI-powered CSV importer — turn any lead export into clean GrowEasy CRM records.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${grotesk.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
