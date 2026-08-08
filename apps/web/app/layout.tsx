import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    'localhost:3000';
  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: 'Sri Vijay Traders — Billing & Operations',
    description:
      'Billing, inventory, delivery, customer and sales tracking for growing shops.',
    openGraph: {
      title: 'Sri Vijay Traders',
      description: 'Billing, inventory & delivery — all in one place.',
      type: 'website',
      images: [{ url: '/og.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Sri Vijay Traders',
      description: 'Billing, inventory & delivery — all in one place.',
      images: ['/og.png'],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
