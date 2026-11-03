"use client";

import { useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/auth/actions";

// Form field: bold label with a red asterisk above a full-width input.
export function AuthInput({
  label,
  type,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  const [shown, setShown] = useState(false);
  const password = type === "password";
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">
        {label} {props.required && <span className="text-coral">*</span>}
      </span>
      <span className="relative block">
        <input
          type={password && shown ? "text" : type}
          className="focus:border-brand w-full border border-[#d1d5db] px-4 py-2.5 pr-12 text-base font-normal focus:outline-none"
          {...props}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-label={shown ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-3 -translate-y-1/2"
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
              <path
                d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"
                fill="none"
                stroke="#000"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="12" r="3" />
              {shown && <path d="m4 4 16 16" stroke="#000" strokeWidth="1.6" />}
            </svg>
          </button>
        )}
      </span>
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="cms-button">
      {children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="text-coral text-sm">
        {state.error}
      </p>
    );
  return (
    <p role="status" className="text-brand text-sm">
      {state.message}
    </p>
  );
}

// Box around the sign-in forms.
export function AccountBox({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-6">{children}</div>;
}
