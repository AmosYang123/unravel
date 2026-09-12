import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A plain modal for grouped controls, e.g. the Settings sections.
 *
 * Hand-rolled rather than Radix: this subset only ships AlertDialog, which is
 * deliberately *not* dismissible by clicking away, and the app takes no new
 * dependencies. Closes on the backdrop, on Escape and on the X; scrolls
 * internally when it is taller than the screen; sits at the bottom of the
 * screen on a phone and centred from `sm` up.
 */
const Dialog = ({
  open,
  onClose,
  title,
  description,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  // Hold the page still behind the modal, and hand focus back where it was.
  React.useEffect(() => {
    if (!open) return;
    const returnFocusTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      // Escape is handled here rather than on the document so a nested
      // AlertDialog can take the key for itself without closing this too.
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 animate-in fade-in-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-background p-6 shadow-lg outline-none animate-in fade-in-0 slide-in-from-bottom-4 sm:rounded-3xl sm:slide-in-from-bottom-0 sm:zoom-in-95",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="quiet-ring -mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export { Dialog };
