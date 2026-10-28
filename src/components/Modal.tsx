import {useEffect, useRef, type ReactNode} from 'react';
import {X} from 'lucide-react';

export default function Modal({title, children, onClose, wide = false}: {title: string; children: ReactNode; onClose: () => void; wide?: boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const dialog = ref.current; dialog?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href], [tabindex="0"]'));
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {e.preventDefault(); last?.focus();}
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {e.preventDefault(); first?.focus();}
      }
    };
    document.addEventListener('keydown', key);
    return () => {document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus();};
  }, [onClose]);
  return <div className="modal-backdrop" onClick={e => {if (e.target === e.currentTarget) onClose();}}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${wide ? 'wide' : ''}`}><div className="modal-header"><h2 id="modal-title">{title}</h2><button aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={22}/></button></div>{children}</div></div>;
}
