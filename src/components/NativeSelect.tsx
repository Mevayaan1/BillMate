import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";

/** Styled native select. On phones it opens the OS picker, which is the easiest control to use. */
export default function NativeSelect({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`h-11 md:h-10 w-full appearance-none rounded-lg border border-input bg-input-background pl-3 pr-9 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
