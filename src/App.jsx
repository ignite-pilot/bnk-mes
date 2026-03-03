import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import PlaceholderPage from './components/PlaceholderPage';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import { menuConfig } from './config/menu';

function App() {
  const allPaths = menuConfig.flatMap((g) =>
    g.children.map((c) => ({ path: c.path, title: c.label }))
  );

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
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
