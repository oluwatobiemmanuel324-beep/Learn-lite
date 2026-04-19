import React from 'react';
import AdminSidebar from './AdminSidebar';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
};

export default function AdminLayout({ title, subtitle, children, rightSlot }: Props) {
  return (
    <div className="admin-layout-shell">
      <AdminSidebar />
      <main className="admin-layout-content admin-page-container">
        <header className="admin-layout-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {rightSlot ? <div>{rightSlot}</div> : null}
        </header>

        <section className="admin-layout-grid">{children}</section>
      </main>
    </div>
  );
}
