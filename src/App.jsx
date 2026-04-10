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
import InventoryOverview from './pages/inventory/InventoryOverview';
import GjInventory from './pages/inventory/GjInventory';
import UsInventory from './pages/inventory/UsInventory';
import MaterialInbound from './pages/material/MaterialInbound';
import DeliveryFinishedProduct from './pages/delivery/DeliveryFinishedProduct';
import DeliverySemiProduct from './pages/delivery/DeliverySemiProduct';
import DeliverySupplier from './pages/delivery/DeliverySupplier';
import DeliveryAffiliate from './pages/delivery/DeliveryAffiliate';
import DeliveryWarehouse from './pages/delivery/DeliveryWarehouse';
import DeliveryRequest from './pages/delivery/DeliveryRequest';
import MasterMaterialInfo from './pages/master/MasterMaterialInfo';
import MasterFinishedProduct from './pages/master/MasterFinishedProduct';
import MasterSemiProduct from './pages/master/MasterSemiProduct';
import ProductionPlan3M from './pages/production/ProductionPlan3M';
import ChatPanel from './components/ChatPanel';
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
      p.path !== '/material/inbound' &&
      p.path !== '/inventory/overview' &&
      p.path !== '/inventory/gj' &&
      p.path !== '/inventory/us' &&
      p.path !== '/delivery/vehicle' &&
      p.path !== '/delivery/product' &&
      p.path !== '/delivery/semi' &&
      p.path !== '/delivery/supplier' &&
      p.path !== '/delivery/partner' &&
      p.path !== '/delivery/warehouse' &&
      p.path !== '/delivery/inbound' &&
      p.path !== '/master/material' &&
      p.path !== '/master/finished-product' &&
      p.path !== '/master/semi-product' &&
      p.path !== '/production/plan-3m'
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
          <Route path="inventory/overview" element={<InventoryOverview />} />
          <Route path="inventory/gj" element={<GjInventory />} />
          <Route path="inventory/us" element={<UsInventory />} />
          <Route path="material/inbound" element={<MaterialInbound />} />
          <Route path="delivery/product" element={<DeliveryFinishedProduct />} />
          <Route path="delivery/semi" element={<DeliverySemiProduct />} />
          <Route path="delivery/supplier" element={<DeliverySupplier />} />
          <Route path="delivery/partner" element={<DeliveryAffiliate />} />
          <Route path="delivery/warehouse" element={<DeliveryWarehouse />} />
          <Route path="delivery/inbound" element={<DeliveryRequest />} />
          <Route path="master/material" element={<MasterMaterialInfo />} />
          <Route path="master/finished-product" element={<MasterFinishedProduct />} />
          <Route path="master/semi-product" element={<MasterSemiProduct />} />
          <Route path="production/plan-3m" element={<ProductionPlan3M />} />
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
      <ChatPanel />
    </AuthProvider>
  );
}

export default App;
