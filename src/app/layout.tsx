import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aegis Control — Operational Command Panel',
  description: 'AI Agents Administrative SOC Control Panel',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-[#05070C] text-[#F3F4F6] font-mono antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
