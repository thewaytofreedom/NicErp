'use client';
export default function PrintButton() {
  return (
    <button className="primary no-print" onClick={() => window.print()}>
      打印 / 保存为 PDF
    </button>
  );
}
