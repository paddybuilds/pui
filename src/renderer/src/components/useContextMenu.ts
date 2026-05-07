import { type MouseEvent as ReactMouseEvent, useCallback, useState } from "react";
import type { ContextMenuItem } from "./ContextMenu";

type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((event: MouseEvent | ReactMouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu
  };
}
