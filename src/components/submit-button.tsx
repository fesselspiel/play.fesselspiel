"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Wird gespeichert...",
  className = "",
  ...props
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={pending}
      className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white transition hover:bg-redbrandHover disabled:cursor-wait disabled:opacity-75 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
