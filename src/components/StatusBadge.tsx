import type { ReactNode } from "react";

const tones = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-accent-foreground",
  neutral: "bg-muted text-muted-foreground",
} as const;

export type Tone = keyof typeof tones;

export default function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}
