import { useEffect, useRef, type ReactNode } from "react";

type FadeInSectionProps = {
  children: ReactNode;
  className?: string;
};

export function FadeInSection({ children, className }: FadeInSectionProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.classList.add("fade-in--visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add("fade-in--visible");
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className={`fade-in ${className ?? ""}`}>
      {children}
    </section>
  );
}
