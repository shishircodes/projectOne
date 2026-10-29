import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "~/lib/cn";

export const buttonStyles = cva(
  "pressable inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium select-none disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover",
        secondary: "bg-surface text-fg border border-border shadow-sm hover:bg-surface-2 hover:border-border-strong",
        ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
        danger: "bg-surface text-bad border border-border shadow-sm hover:bg-bad-soft hover:border-bad/30",
        link: "text-link hover:underline underline-offset-4 px-0 h-auto",
      },
      shape: {
        default: "rounded-lg",
        pill: "rounded-full",
      },
      size: {
        sm: "h-8 px-2.5 text-sm",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-base",
        xl: "h-12 px-6 text-base",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md", shape: "default" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, shape, loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonStyles({ variant, size, shape }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
