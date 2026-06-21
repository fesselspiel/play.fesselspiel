"use client";

import { useEffect, useRef, useState } from "react";

export function ShopifyBulkVisibilityToggle({ total }: { total: number }) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [checkedCount, setCheckedCount] = useState(0);

  function visibleInputs() {
    return Array.from(document.querySelectorAll<HTMLInputElement>('[data-shopify-visible-checkbox="true"]'));
  }

  function refreshState() {
    const inputs = visibleInputs();
    const nextCheckedCount = inputs.filter((input) => input.checked).length;
    setCheckedCount(nextCheckedCount);
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = nextCheckedCount > 0 && nextCheckedCount < inputs.length;
    }
  }

  useEffect(() => {
    refreshState();
    const inputs = visibleInputs();
    inputs.forEach((input) => input.addEventListener("change", refreshState));
    return () => inputs.forEach((input) => input.removeEventListener("change", refreshState));
  }, []);

  function toggleAll(nextChecked: boolean) {
    const inputs = visibleInputs();
    inputs.forEach((input) => {
      input.checked = nextChecked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    refreshState();
  }

  if (!total) return null;

  return (
    <label className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink">
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checkedCount === total}
        onChange={(event) => toggleAll(event.currentTarget.checked)}
        className="h-4 w-4 accent-redbrand"
      />
      Alle Produkte anzeigen
      <span className="text-xs font-medium text-graphite">
        {checkedCount}/{total}
      </span>
    </label>
  );
}
