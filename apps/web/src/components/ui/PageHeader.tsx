type PageHeaderProps = {
  title: string;
  description?: string;
  meta?: string;
};

export function PageHeader({ title, description, meta }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__row">
        <h1>{title}</h1>
        {meta && <span className="page-header__meta">{meta}</span>}
      </div>
      {description && <p className="page-header__sub">{description}</p>}
    </header>
  );
}
