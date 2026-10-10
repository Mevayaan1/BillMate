import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export default function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10">
      {Icon && (
        <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-6" />
        </div>
      )}
      <div className="font-medium">{title}</div>
      {text && <p className="text-sm text-muted-foreground max-w-xs">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
