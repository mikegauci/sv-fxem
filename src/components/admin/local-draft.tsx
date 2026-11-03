"use client";
import { useEffect, useState, useRef } from "react";
export function LocalDraft<T>({
  draftKey,
  value,
  onRestore,
}: {
  draftKey: string;
  value: T;
  onRestore: (value: T) => void;
}) {
  const initial = useRef(JSON.stringify(value));
  const [saved, setSaved] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw && raw !== initial.current) setSaved(JSON.parse(raw));
      } catch {}
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [draftKey]);
  useEffect(() => {
    if (!ready || saved || JSON.stringify(value) === initial.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(value));
      } catch {}
    }, 1500);
    return () => clearTimeout(timer);
  }, [draftKey, value, ready, saved]);
  return (
    <div className="mb-4 rounded bg-white p-3 text-sm">
      <p>
        Draft edits are saved on this browser. Use Save to update the website.
      </p>
      {saved && (
        <button
          type="button"
          className="mt-2 underline"
          onClick={() => {
            onRestore(saved);
            setSaved(null);
          }}
        >
          Recover the previous local draft
        </button>
      )}
      {saved && (
        <button
          type="button"
          className="ml-4 underline"
          onClick={() => setSaved(null)}
        >
          Discard local draft
        </button>
      )}
    </div>
  );
}
