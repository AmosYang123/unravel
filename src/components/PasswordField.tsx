import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  className?: string;
}

/**
 * A password box you can look inside. The toggle is a real button beside the
 * field rather than an overlay on it, so tabbing goes field → toggle and the
 * caret is never trapped, and its accessible name says what pressing it will
 * do next rather than what state the field is in.
 */
const PasswordField = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required,
  className,
}: PasswordFieldProps) => {
  const [shown, setShown] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 rounded-xl bg-card"
          required={required}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground",
            "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {shown ? (
            <EyeOff className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
};

export default PasswordField;
