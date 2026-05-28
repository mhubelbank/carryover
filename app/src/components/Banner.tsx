import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type BannerVariant = "info" | "warning" | "danger";

interface BannerProps {
  variant: BannerVariant;
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}

const DEFAULT_ICONS: Record<BannerVariant, IconName> = {
  info: "info-circle",
  warning: "alert-circle",
  danger: "alert-circle",
};

export function Banner({ variant, icon, children, action }: BannerProps) {
  return (
    <div
      className={`banner banner--${variant}`}
      style={{ justifyContent: "space-between" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={icon ?? DEFAULT_ICONS[variant]} size={16} />
        <span>{children}</span>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
