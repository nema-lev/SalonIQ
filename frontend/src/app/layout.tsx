import { Toaster } from 'sonner';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata = {
  title: 'SalonIQ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        {/* Preconnect за Google Fonts ако се ползва */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>
          {children}
          <Toaster
            position="top-center"
            richColors
            toastOptions={{
              style: {
                fontFamily: 'var(--font-sans)',
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
