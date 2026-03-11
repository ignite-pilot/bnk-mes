import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PlaceholderPage from './components/PlaceholderPage';
import Home from './pages/Home';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import MaterialInfo from './pages/material/MaterialInfo';
import MaterialSupplier from './pages/material/MaterialSupplier';
import MaterialWarehouse from './pages/material/MaterialWarehouse';
import MaterialStock from './pages/material/MaterialStock';
import MaterialInbound from './pages/material/MaterialInbound';
import { menuConfig } from './config/menu';

function App() {
  const allPaths = menuConfig.flatMap((g) =>
    g.children.map((c) => ({ path: c.path, title: c.label }))
  ).filter(
    (p) =>
      p.path !== '/material/info' &&
      p.path !== '/material/supplier' &&
      p.path !== '/material/warehouse' &&
      p.path !== '/material/stock' &&
      p.path !== '/material/inbound'
  );

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Home />} />
          <Route path="material/info" element={<MaterialInfo />} />
          <Route path="material/supplier" element={<MaterialSupplier />} />
          <Route path="material/warehouse" element={<MaterialWarehouse />} />
          <Route path="material/stock" element={<MaterialStock />} />
          <Route path="material/inbound" element={<MaterialInbound />} />
          {allPaths.map(({ path, title }) => (
            <Route
              key={path}
              path={path.replace(/^\//, '')}
              element={<PlaceholderPage title={title} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
