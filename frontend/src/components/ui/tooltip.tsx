import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-pop",
        "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

/**
 * Convenience wrapper: <SimpleTooltip label="..."><button/></SimpleTooltip>
 *
 * Forwards its ref and spreads any extra props onto the trigger so it can be
 * composed inside another `asChild` trigger (e.g. a DialogTrigger or
 * PopoverTrigger) without dropping the parent's ref/handlers.
 */
type SimpleTooltipProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
} & Omit<React.ComponentPropsWithoutRef<typeof TooltipTrigger>, "asChild" | "children">;

export const SimpleTooltip = React.forwardRef<
  React.ElementRef<typeof TooltipTrigger>,
  SimpleTooltipProps
>(({ label, children, side = "top", ...props }, ref) => (
  <Tooltip>
    <TooltipTrigger ref={ref} asChild {...props}>
      {children}
    </TooltipTrigger>
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>
));
SimpleTooltip.displayName = "SimpleTooltip";
