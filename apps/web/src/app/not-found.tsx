import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="empty-state">
      <h1>页面不存在</h1>
      <p>请从工作台选择可用模块。</p>
      <Link href="/">返回工作台</Link>
    </section>
  );
}
