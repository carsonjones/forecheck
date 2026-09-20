import type { ReactNode } from 'react';

type AppHeaderProps = { title: string };
type AppFooterProps = { children: ReactNode };
type LayoutProps = { title: string; footer: ReactNode; children: ReactNode };

const openMenu = () => window.dispatchEvent(new Event('open-cmdk'));

export function AppHeader({ title }: AppHeaderProps) {
  return <header className="app-header"><button className="header-button" onClick={openMenu}>{title}</button></header>;
}

export function AppFooter({ children }: AppFooterProps) {
  return (
    <footer className="app-footer">
      <button className="brand-button" onClick={openMenu}>● forecheck</button>
      <span>{children}</span>
    </footer>
  );
}

export function Layout({ title, footer, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <AppHeader title={title} />
      <main className="app-main">{children}</main>
      <AppFooter>{footer}</AppFooter>
    </div>
  );
}
