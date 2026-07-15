import Link from "next/link";

type LinkOption = {
  id: string;
  title: string;
  imageUrl?: string | null;
  href?: string;
  fallback: string;
};

function OptionGrid({ name, options, selectedIds = [] }: { name: string; options: LinkOption[]; selectedIds?: string[] }) {
  const selected = new Set(selectedIds);
  const selectableOptions = options.filter((option) => !selected.has(option.id));
  if (!selectableOptions.length) return <p className="text-sm text-graphite">Keine weiteren Einträge verfügbar.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {selectableOptions.map((option) => (
        <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-line bg-surface p-2 text-sm hover:border-redbrand hover:bg-paper">
          <input name={name} value={option.id} type="checkbox" defaultChecked={selected.has(option.id)} className="h-4 w-4 shrink-0 accent-redbrand" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.imageUrl || option.fallback} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{option.title}</span>
            {option.href ? <span className="block truncate text-xs text-graphite">{option.href}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

function SelectedGrid({ name, options, selectedIds = [] }: { name: string; options: LinkOption[]; selectedIds?: string[] }) {
  const selected = new Set(selectedIds);
  const selectedOptions = options.filter((option) => selected.has(option.id));
  if (!selectedOptions.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {selectedOptions.map((option) => (
        <div key={option.id} className="flex items-center gap-3 rounded-md border border-redbrand/30 bg-redbrand/10 p-2 text-sm">
          <input name={name} value={option.id} type="hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.imageUrl || option.fallback} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{option.title}</span>
            <span className="block truncate text-xs font-semibold text-redbrand">bereits verknüpft</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function LinkSection({
  title,
  name,
  options,
  selectedIds = []
}: {
  title: string;
  name: string;
  options: LinkOption[];
  selectedIds?: string[];
}) {
  if (!options.length) return null;
  const selectedCount = selectedIds.filter((id) => options.some((option) => option.id === id)).length;
  return (
    <details className="rounded-md border border-line bg-surface" open={selectedCount > 0}>
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-semibold text-ink marker:hidden">
        <span>{title}</span>
        <span className="rounded-full bg-paper px-2 py-1 text-xs text-graphite">{selectedCount ? `${selectedCount} verknüpft` : `${options.length} verfügbar`}</span>
      </summary>
      <div className="space-y-3 border-t border-line p-3">
        <SelectedGrid name={name} options={options} selectedIds={selectedIds} />
        <OptionGrid name={name} options={options} selectedIds={selectedIds} />
      </div>
    </details>
  );
}

export function TrackerLinkPicker({
  toys = [],
  bondageItems = [],
  positions = [],
  selectedToyIds = [],
  selectedBondageItemIds = [],
  selectedPositionIds = []
}: {
  toys?: LinkOption[];
  bondageItems?: LinkOption[];
  positions?: LinkOption[];
  selectedToyIds?: string[];
  selectedBondageItemIds?: string[];
  selectedPositionIds?: string[];
}) {
  if (!toys.length && !bondageItems.length && !positions.length) return null;
  const selectedCount = selectedToyIds.length + selectedPositionIds.length + selectedBondageItemIds.length;
  return (
    <details className="rounded-lg border border-line bg-paper" open={selectedCount > 0}>
      <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 font-semibold text-ink marker:hidden">
        <span>Verknüpfungen</span>
        <span className="rounded-full bg-surface px-2 py-1 text-xs text-graphite">{selectedCount ? `${selectedCount} ausgewählt` : "aufklappen"}</span>
      </summary>
      <div className="space-y-3 border-t border-line p-3">
        <LinkSection title="Spielsachen" name="toys" options={toys} selectedIds={selectedToyIds} />
        <LinkSection title="Szenen" name="positions" options={positions} selectedIds={selectedPositionIds} />
        <LinkSection title="Shopify-Produkte" name="bondageItems" options={bondageItems} selectedIds={selectedBondageItemIds} />
      </div>
    </details>
  );
}

export function TrackerLinkedCards({
  title,
  items
}: {
  title: string;
  items: LinkOption[];
}) {
  if (!items.length) return null;
  return (
    <section className="mt-5 rounded-md border border-line bg-paper p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const content = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl || item.fallback} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{item.title}</span>
                {item.href ? <span className="block truncate text-xs text-graphite">{item.href}</span> : null}
              </span>
            </>
          );
          return item.href ? (
            <Link key={item.id} href={item.href} className="flex items-center gap-3 rounded-md bg-surface p-2 text-sm hover:text-redbrand">
              {content}
            </Link>
          ) : (
            <div key={item.id} className="flex items-center gap-3 rounded-md bg-surface p-2 text-sm">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
