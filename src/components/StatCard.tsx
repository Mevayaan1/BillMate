import type { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

const colors = {
  default: "text-foreground",
  danger: "text-destructive",
  warning: "text-warning",
  success: "text-success",
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: keyof typeof colors;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
    </Card>
  );
}
