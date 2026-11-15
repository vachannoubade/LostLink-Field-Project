import { Outlet } from 'react-router-dom';

export function AdminLayout() {
  return (
    <main className="admin-layout" aria-label="Administration console">
      <Outlet />
    </main>
  );
}
