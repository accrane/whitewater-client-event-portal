import type { ComponentProps } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "sm";

// Primary follows the --brand tokens: near-black in the client portal, the
// green accent inside the admin themes (see globals.css).
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--brand-border)] bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50",
  ghost:
    "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  destructive: "border border-red-700 bg-red-600 text-white hover:bg-red-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "h-9 px-3.5 text-sm",
  sm: "h-7 px-2.5 text-[13px]",
};

// Shared look for <button> and <Link>; server-component safe.
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]}`;
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${buttonClasses(variant, size)} ${className}`}
      type={type}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={`${buttonClasses(variant, size)} ${className}`} {...props} />
  );
}
