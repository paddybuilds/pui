import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  id: string;
  icon?: ReactNode;
  label?: string;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onSelect?: () => void;
};

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
};

export function ContextMenu({ x, y, items, onClose, ariaLabel = "Context menu" }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (items.length === 0) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          aria-label={item.ariaLabel ?? item.label}
          className={item.destructive ? "destructive" : undefined}
          onClick={() => {
            if (item.disabled) {
              return;
            }
            item.onSelect?.();
            onClose();
          }}
        >
          <span className="context-menu-icon" aria-hidden="true">
            {item.icon ?? null}
          </span>
          {item.label ? <span className="context-menu-label">{item.label}</span> : null}
          {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
        </button>
      ))}
    </div>,
    document.body
  );
}
