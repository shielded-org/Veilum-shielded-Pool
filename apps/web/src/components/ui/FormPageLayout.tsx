import type { ReactNode } from "react";

type FormPageLayoutProps = {
  children: ReactNode;
  aside?: ReactNode;
};

export function FormPageLayout({ children, aside }: FormPageLayoutProps) {
  return (
    <div className={`form-layout${aside ? "" : " form-layout--single"}`}>
      <div className="form-layout__main">{children}</div>
      {aside}
    </div>
  );
}

type FormAsidePanelProps = {
  title: string;
  children: ReactNode;
};

export function FormAsidePanel({ title, children }: FormAsidePanelProps) {
  return (
    <aside className="form-aside" aria-label={title}>
      <h3 className="form-aside__title">{title}</h3>
      {children}
    </aside>
  );
}

type FormAsideListProps = {
  items: { term: string; detail: string }[];
};

export function FormAsideList({ items }: FormAsideListProps) {
  return (
    <dl className="form-aside__list">
      {items.map(({ term, detail }) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
