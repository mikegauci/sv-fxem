"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (form: FormData) => Promise<{ error: string } | void>;
  children: ReactNode;
  className?: string;
}) {
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setMessage("");
        setOk(false);
        start(async () => {
          try {
            const result = await action(data);
            if (result?.error) setMessage(result.error);
            else {
              setOk(true);
              setMessage("Saved successfully.");
              router.refresh();
            }
          } catch {
            setMessage("Could not complete this change. Please try again.");
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && (
        <p role="status" className="text-sm">
          Saving…
        </p>
      )}
      {message && (
        <p
          role={ok ? "status" : "alert"}
          className={`${ok ? "text-green-700" : "text-coral"} mt-3 text-sm`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
