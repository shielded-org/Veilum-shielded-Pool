import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

export type RevealVariant = "up" | "fade" | "left" | "right";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
  /** Delay before animation starts (ms). */
  delay?: number;
  /** Reveal on mount (hero) instead of waiting for scroll. */
  immediate?: boolean;
  as?: ElementType;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useRevealVisible(
  ref: React.RefObject<HTMLElement | null>,
  { immediate, delay }: { immediate?: boolean; delay: number }
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.classList.add("scroll-reveal--visible");
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;

    const show = () => {
      timeoutId = setTimeout(() => {
        el.classList.add("scroll-reveal--visible");
      }, delay);
    };

    if (immediate) {
      requestAnimationFrame(() => requestAnimationFrame(show));
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          show();
          observer?.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    observer.observe(el);

    return () => {
      observer?.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [immediate, delay]);
}

export function ScrollReveal({
  children,
  className,
  variant = "up",
  delay = 0,
  immediate = false,
  as: Tag = "section",
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement>(null);
  useRevealVisible(ref, { immediate, delay });

  const style = delay ? ({ ["--reveal-delay" as string]: `${delay}ms` } as CSSProperties) : undefined;

  return (
    <Tag
      ref={ref}
      className={`scroll-reveal scroll-reveal--${variant}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </Tag>
  );
}

type RevealItemProps = {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
  /** Stagger index — multiplied by 90ms. */
  index?: number;
  as?: ElementType;
};

export function RevealItem({
  children,
  className,
  variant = "up",
  index = 0,
  as: Tag = "div",
}: RevealItemProps) {
  const ref = useRef<HTMLElement>(null);
  const delay = index * 90;
  useRevealVisible(ref, { immediate: false, delay });

  return (
    <Tag
      ref={ref}
      className={`scroll-reveal scroll-reveal--${variant}${className ? ` ${className}` : ""}`}
      style={{ ["--reveal-delay" as string]: `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** @deprecated Use ScrollReveal — kept for existing imports. */
export function FadeInSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ScrollReveal className={className}>{children}</ScrollReveal>;
}
