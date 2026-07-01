import { Toaster as Sonner } from "sonner";
import { Check } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Positioned just above the bottom dock.
// Dock sits at: calc(0.75rem + env(safe-area-inset-bottom))
// Dock height is roughly 3.25rem → total clearance ≈ 4.5rem + safe-area
const DOCK_OFFSET = "calc(4.5rem + env(safe-area-inset-bottom, 0px))";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <>
      {/*
        Custom enter/exit animations:
        - Enter: slide up 8px + fade in
        - Exit:  dissolve (opacity only, no movement)
        Using !important to override Sonner's default inline-style transitions.
      */}
      <style>{`
        @keyframes vgr-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes vgr-toast-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        [data-sonner-toast][data-mounted='true'][data-removed='false'] {
          animation: vgr-toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        [data-sonner-toast][data-removed='true'] {
          animation: vgr-toast-out 0.22s ease-out forwards !important;
          pointer-events: none;
        }
      `}</style>
      <Sonner
        position="bottom-center"
        offset={DOCK_OFFSET}
        duration={2000}
        icons={{
          success: <Check className="h-4 w-4 text-emerald-500" />,
        }}
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-soft",
            description: "group-[.toast]:text-muted-foreground",
            actionButton:
              "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
            cancelButton:
              "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          },
        }}
        {...props}
      />
    </>
  );
};

export { Toaster };
