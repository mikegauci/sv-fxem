"use client";
export function SelectAll() {
  return (
    <label className="mb-3 flex gap-3 text-sm font-semibold">
      <input
        type="checkbox"
        onChange={(event) => {
          const checked = event.currentTarget.checked;
          const form = event.currentTarget.form;
          if (form)
            for (const element of Array.from(form.elements)) {
              if (element instanceof HTMLInputElement && element.name === "ids")
                element.checked = checked;
            }
        }}
      />
      Select all on this page
    </label>
  );
}
