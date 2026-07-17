import type { ComponentProps } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "sm";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-slate-950 text-white hover:bg-slate-800",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-[13px]",
};

// Shared look for <button> and <Link>; server-component safe.
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]}`;
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
