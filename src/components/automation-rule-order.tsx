"use client";

import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import Link from "next/link";

type RuleOrderItem = {
  id: string;
  name: string;
  summary: string;
  editHref?: string;
};

export function AutomationRuleOrder({
  rules,
  reorderAction,
  templateId
}: {
  rules: RuleOrderItem[];
  reorderAction: (formData: FormData) => void | Promise<void>;
  templateId?: string;
}) {
  const [items, setItems] = useState(rules);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const orderRef = useRef<HTMLInputElement>(null);

  function moveBefore(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const originalTargetIndex = current.findIndex((item) => item.id === targetId);
      const next = current.filter((item) => item.id !== draggedId);
      const moved = current.find((item) => item.id === draggedId);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      if (!moved || targetIndex < 0) return current;
      const insertIndex = draggedIndex < originalTargetIndex ? targetIndex + 1 : targetIndex;
      next.splice(insertIndex, 0, moved);
      if (orderRef.current) orderRef.current.value = JSON.stringify(next.map((item) => item.id));
      window.setTimeout(() => formRef.current?.requestSubmit(), 0);
      return next;
    });
  }

  return (
    <form ref={formRef} action={reorderAction} className="space-y-2">
      {templateId ? <input type="hidden" name="templateId" value={templateId} /> : null}
      <input ref={orderRef} type="hidden" name="ruleOrder" value={JSON.stringify(items.map((item) => item.id))} readOnly />
      {items.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => setDraggedId(item.id)}
          onDragEnd={() => setDraggedId(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            moveBefore(item.id);
          }}
          className={`flex cursor-grab items-start gap-3 rounded-md border bg-paper p-3 active:cursor-grabbing ${draggedId === item.id ? "border-redbrand opacity-60" : "border-line"}`}
        >
          <GripVertical className="mt-0.5 h-5 w-5 shrink-0 text-graphite" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink"><span className="mr-2 text-graphite">{index + 1}.</span>{item.name}</div>
            <div className="mt-1 text-sm text-graphite">{item.summary}</div>
            {item.editHref ? <Link href={item.editHref} className="mt-2 inline-flex text-sm font-semibold text-redbrand hover:underline">Bearbeiten</Link> : null}
          </div>
        </div>
      ))}
      <p className="text-xs text-graphite">Zum Sortieren eine Regel anfassen und an die gewünschte Stelle ziehen. Die Reihenfolge wird sofort gespeichert.</p>
    </form>
  );
}
