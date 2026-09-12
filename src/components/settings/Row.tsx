/** One labelled settings line: title, optional description, control on the right. */
const Row = ({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: string;
  /** When set, the title becomes a real <label> for the control with this id. */
  htmlFor?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-6 py-5">
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-base">
          {title}
        </label>
      ) : (
        <p className="text-base">{title}</p>
      )}
      {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export default Row;
