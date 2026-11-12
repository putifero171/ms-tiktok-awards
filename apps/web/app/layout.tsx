import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'MS TikTok Awards 2026 | Angola', description: 'Uma celebração independente dos criadores digitais, artistas e comunidades de Angola.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt"><body>{children}</body></html>; }