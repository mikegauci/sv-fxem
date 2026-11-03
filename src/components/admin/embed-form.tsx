"use client";
import { useState } from "react";
import {
  buildIframeEmbed,
  parseIframeSnippet,
  wrapCode,
} from "@/lib/admin/embeds.mjs";

export type EmbedSettings = {
  mode: "iframe" | "code";
  src?: string;
  title?: string;
  height?: number;
  aspect?: string | null;
  allowFullscreen?: boolean;
  sandbox?: boolean;
  wrap?: boolean;
};
const field =
  "block w-full rounded border border-black/20 bg-white p-2 text-sm";
export function EmbedForm({
  initial,
  code = "",
  fullAdmin,
  onSave,
  onCancel,
}: {
  initial?: EmbedSettings;
  code?: string;
  fullAdmin: boolean;
  onSave: (html: string, options: EmbedSettings) => void;
  onCancel?: () => void;
}) {
  const [options, setOptions] = useState<EmbedSettings>(
    initial ?? {
      mode: "iframe",
      src: "",
      title: "",
      height: 450,
      aspect: null,
      allowFullscreen: true,
      wrap: true,
    },
  );
  const [raw, setRaw] = useState(() =>
    initial?.wrap
      ? code.replace(
          /^<div class="fxem-embed fxem-embed--code">([\s\S]*)<\/div>$/,
          "$1",
        )
      : code,
  );
  const [error, setError] = useState("");
  const update = (patch: Partial<EmbedSettings>) =>
    setOptions((o) => ({ ...o, ...patch }));
  return (
    <div
      className="space-y-3 rounded border border-black/20 bg-white p-4 text-sm"
      dir="ltr"
    >
      <label>
        Embed type
        <select
          className={field}
          value={options.mode}
          onChange={(e) =>
            update({ mode: e.target.value as EmbedSettings["mode"] })
          }
        >
          <option value="iframe">Iframe</option>
          <option value="code" disabled={!fullAdmin}>
            HTML / JavaScript (full admins only)
          </option>
        </select>
      </label>
      {!fullAdmin && <p>Only full admins can add or change code snippets.</p>}
      {options.mode === "iframe" ? (
        <>
          <label>
            HTTPS URL (or paste an iframe snippet)
            <input
              className={field}
              value={options.src ?? ""}
              onChange={(e) => {
                const parsed = parseIframeSnippet(e.target.value);
                update(
                  parsed
                    ? { ...parsed, title: parsed.title || options.title }
                    : { src: e.target.value },
                );
              }}
            />
          </label>
          <label>
            Accessible title
            <input
              className={field}
              value={options.title ?? ""}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            Aspect ratio
            <select
              className={field}
              value={options.aspect ?? ""}
              onChange={(e) => update({ aspect: e.target.value || null })}
            >
              <option value="">Fixed height</option>
              {["16:9", "4:3", "1:1"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          {!options.aspect && (
            <label>
              Height (px)
              <input
                type="number"
                min={50}
                max={5000}
                className={field}
                value={options.height ?? 450}
                onChange={(e) => update({ height: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={!!options.allowFullscreen}
              onChange={(e) => update({ allowFullscreen: e.target.checked })}
            />
            Allow fullscreen
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={!!options.sandbox}
              onChange={(e) => update({ sandbox: e.target.checked })}
            />
            Sandbox
          </label>
        </>
      ) : (
        <>
          <label>
            HTML / JavaScript
            <textarea
              className={`${field} h-56 font-mono text-xs`}
              value={raw}
              disabled={!fullAdmin}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              disabled={!fullAdmin}
              checked={options.wrap !== false}
              onChange={(e) => update({ wrap: e.target.checked })}
            />
            Wrap in a container
          </label>
          <p className="rounded bg-black/5 p-3 font-mono text-xs break-all">
            Code placeholder:{" "}
            {raw.split("\n")[0].slice(0, 150) || "Empty snippet"}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-coral">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          className="cms-button"
          onClick={() => {
            try {
              if (options.mode === "code" && !fullAdmin)
                throw new Error("Only full admins can add or change scripts.");
              const html =
                options.mode === "iframe"
                  ? buildIframeEmbed(options)
                  : wrapCode(raw, options.wrap !== false);
              if (new TextEncoder().encode(html).length > 100_000)
                throw new Error("Embed HTML is limited to 100 KB.");
              onSave(html, {
                ...options,
                ...(options.mode === "code"
                  ? { wrap: options.wrap !== false }
                  : {}),
              });
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply embed
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
