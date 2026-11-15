import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { DataProvider } from '../store/DataContext';
import { Layout } from './Layout';

export function StudentLayout() {
  const { loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <main className="page-container" aria-busy="true" aria-live="polite">
        Loading your portal...
      </main>
    );
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <DataProvider>
      <Layout />
    </DataProvider>
  );
}
