'use client';
import { useLanguage } from '@/components/locale-provider';
import { useEffect, useRef } from 'react';
export function Dialog({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <h2>{t(title)}</h2>
        <button className="icon-button" aria-label={t('关闭')} onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({ text = '暂无记录，点击右上角新建开始。' }: { text?: string }) {
  const { t } = useLanguage();
  return <div className="table-empty">{t(text)}</div>;
}
export function ErrorMessage({ error }: { error: string }) {
  const { t } = useLanguage();
  return error ? (
    <div role="alert" className="error">
      {t(error)}
    </div>
  ) : null;
}
