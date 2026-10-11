'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>暂时无法加载数据</h2>
      <p>请检查服务连接后重试。</p>
      <button onClick={reset}>重试</button>
    </div>
  );
}
