import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './store/AuthContext';
import { DataProvider } from './store/DataContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { BrowseItems } from './pages/BrowseItems';
import { ReportForm } from './pages/ReportForm';
import { AIMatches } from './pages/AIMatches';
import { MyReports } from './pages/MyReports';
import { ItemDetails } from './pages/ItemDetails';
import { Notifications } from './pages/Notifications';
import { Profile } from './pages/Profile';
import { Auth } from './pages/Auth';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            {/* Standalone Authentication Routes */}
            <Route path="/login" element={<Auth defaultMode="login" />} />
            <Route path="/signup" element={<Auth defaultMode="signup" />} />
            <Route path="/auth" element={<Auth />} />

            {/* Application Shell Routes */}
            <Route path="/" element={<Layout />}>
              {/* Public Browsing Routes */}
              <Route index element={<Dashboard />} />
              <Route path="browse" element={<BrowseItems />} />
              <Route path="items/:id" element={<ItemDetails />} />

              {/* Account-Specific Protected Routes */}
              <Route
                path="report/lost"
                element={(
                  <ProtectedRoute>
                    <ReportForm />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="report/found"
                element={(
                  <ProtectedRoute>
                    <ReportForm />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="report/edit/:id"
                element={(
                  <ProtectedRoute>
                    <ReportForm />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="my-reports"
                element={(
                  <ProtectedRoute>
                    <MyReports />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="ai-matches"
                element={(
                  <ProtectedRoute>
                    <AIMatches />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="notifications"
                element={(
                  <ProtectedRoute>
                    <Notifications />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="profile"
                element={(
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                )}
              />

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
