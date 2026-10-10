import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/** Standard tappable list row: title and subtitle on the left, a value on the right. */
export default function ListRow({
  to,
  onClick,
  title,
  subtitle,
  right,
  rightSub,
  children,
}: {
  to?: string;
  onClick?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  children?: ReactNode;
}) {
  const body = (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-accent/50 active:bg-accent">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
        {children}
      </div>
      {(right || rightSub) && (
        <div className="text-right shrink-0">
          {right && <div className="font-semibold tabular-nums">{right}</div>}
          {rightSub && <div className="text-xs">{rightSub}</div>}
        </div>
      )}
      {(to || onClick) && <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
    </div>
  );
  if (to) return <Link to={to} className="block">{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{body}</button>;
  return body;
}
