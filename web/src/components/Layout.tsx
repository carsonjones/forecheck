import type { ReactNode } from 'react';

type LayoutProps = { header: ReactNode; footer: ReactNode; children: ReactNode };

export function Layout({ header, footer, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">{header}</header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">{footer}</footer>
    </div>
  );
}
