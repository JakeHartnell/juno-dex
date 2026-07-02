import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusFirstElement(cardRef.current);
    return () => {
      document.body.style.overflow = previousOverflow;
      previousActiveElement.current?.focus();
    };
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Tab") trapTabFocus(event, cardRef.current);
  };

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section ref={cardRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" aria-label="Close modal" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    toggle: useCallback(() => setIsOpen((value) => !value), []),
  };
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("aria-hidden"));
}

function focusFirstElement(container: HTMLElement | null) {
  const first = getFocusableElements(container)[0];
  first?.focus();
}

function trapTabFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
