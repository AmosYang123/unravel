import { ChevronRight } from "lucide-react";

/** One settings line that opens its controls in a dialog: name, current value, chevron. */
const SettingRow = ({
  title,
  value,
  onClick,
}: {
  title: string;
  /** Read at a glance, so the page is scannable without opening anything. */
  value: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-haspopup="dialog"
    className="quiet-ring flex w-full items-center justify-between gap-6 py-5 text-left"
  >
    <span className="text-base">{title}</span>
    <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
      {value}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </span>
  </button>
);

export default SettingRow;
