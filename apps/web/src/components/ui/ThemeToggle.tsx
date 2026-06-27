import { IconMoon, IconSun } from "./icons";
import { useTheme } from "../../hooks/use-theme";
import { cn } from "../../lib/cn";

type ThemeToggleProps = {
  className?: string;
  /** Compact icon-only button (default). */
  variant?: "icon" | "labeled";
};

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  if (variant === "labeled") {
    return (
      <button
        type="button"
        className={cn("theme-toggle theme-toggle--labeled", className)}
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
        <span>{isDark ? "Light" : "Dark"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn("theme-toggle", className)}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
      <span className="sr-only">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
