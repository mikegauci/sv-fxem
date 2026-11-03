export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-ink text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
