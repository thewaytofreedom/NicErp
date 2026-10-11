import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'NicErp · 企业管理', template: '%s · NicErp' },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
