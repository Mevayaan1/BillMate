import type { ReactNode } from "react";
import { useIsMobile } from "../hooks/use-mobile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

/** Centred dialog on desktop, bottom sheet on phones. */
export default function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-6">
          <SheetHeader className="px-0">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className={description ? "" : "sr-only"}>{description ?? title}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? "" : "sr-only"}>{description ?? title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
