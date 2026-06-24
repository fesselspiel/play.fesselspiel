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
  if (!options.length) return <p className="text-sm text-graphite">Keine verfügbaren Einträge.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => (
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
  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-3">
      <h3 className="font-semibold text-ink">Verknüpfungen</h3>
      {toys.length ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-graphite">Spielsachen</h4>
          <OptionGrid name="toys" options={toys} selectedIds={selectedToyIds} />
        </section>
      ) : null}
      {bondageItems.length ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-graphite">Bondage-System</h4>
          <OptionGrid name="bondageItems" options={bondageItems} selectedIds={selectedBondageItemIds} />
        </section>
      ) : null}
      {positions.length ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-graphite">Szenen</h4>
          <OptionGrid name="positions" options={positions} selectedIds={selectedPositionIds} />
        </section>
      ) : null}
    </div>
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
