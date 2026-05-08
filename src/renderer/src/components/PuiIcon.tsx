import type { CSSProperties } from "react";

type PuiIconProps = {
  className?: string;
  size?: number;
};

export function PuiIcon({ className, size = 22 }: PuiIconProps) {
  return (
    <span
      className={className ? `pui-icon ${className}` : "pui-icon"}
      style={{ "--pui-icon-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      P
    </span>
  );
}
