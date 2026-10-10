import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './store/DataContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { BrowseItems } from './pages/BrowseItems';
import { ReportForm } from './pages/ReportForm';
import { AIMatches } from './pages/AIMatches';
import { MyReports } from './pages/MyReports';
import { Admin } from './pages/Admin';
import { Profile } from './pages/Profile';
import './index.css';

function App() {
  return (
    <DataProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="browse" element={<BrowseItems />} />
            <Route path="report/lost" element={<ReportForm />} />
            <Route path="report/found" element={<ReportForm />} />
            <Route path="my-reports" element={<MyReports />} />
            <Route path="ai-matches" element={<AIMatches />} />
            <Route path="profile" element={<Profile />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </DataProvider>
  );
}

export default App;
