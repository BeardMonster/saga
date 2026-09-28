import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

// Radix opens a menu the moment a finger touches its button (pointerdown).
// On a phone that means starting a scroll with your thumb on a "⋮" opens the
// menu instead of scrolling. So for touch/pen the menu opens on a completed
// tap (click) instead — a scroll or drag cancels the click. Mouse behavior is
// unchanged. Works for both controlled and uncontrolled menus.
const TouchToggleContext = React.createContext<(() => void) | null>(null);

const DropdownMenu = ({ open: openProp, onOpenChange, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) => {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : innerOpen;
  const setOpen = (value: boolean) => {
    if (!controlled) setInnerOpen(value);
    onOpenChange?.(value);
  };
  return (
    <TouchToggleContext.Provider value={() => setOpen(!open)}>
      <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </TouchToggleContext.Provider>
  );
};

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ onPointerDown, onClick, ...props }, ref) => {
  const toggle = React.useContext(TouchToggleContext);
  const touched = React.useRef(false);
  return (
    <DropdownMenuPrimitive.Trigger
      ref={ref}
      {...props}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        touched.current = e.pointerType !== "mouse";
        // Cancelling stops Radix's own open-on-pointerdown; the click still fires after a real tap.
        if (touched.current) e.preventDefault();
      }}
      onClick={(e) => {
        onClick?.(e);
        if (touched.current) {
          touched.current = false;
          toggle?.();
        }
      }}
    />
  );
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";
const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = { top: 8, bottom: 80, left: 8, right: 8 }, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "z-50 min-w-[12rem] max-w-[calc(100vw-2rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

// min-h-12 keeps every menu row at Material's 48px touch target.
const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-12 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 md:min-h-10",
      destructive && "text-destructive focus:text-destructive",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label ref={ref} className={cn("px-3 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
};
