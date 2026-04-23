import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './lib/db.js';
import healthRouter from './routes/health.js';
import memberRouter from './routes/member.js';
import materialRouter from './routes/material.js';
import materialSupplierRouter, { listHandler as materialSupplierList } from './routes/material-supplier.js';
import materialWarehouseRouter from './routes/material-warehouse.js';
import materialStockRouter from './routes/material-stock.js';
import inventoryOverviewRouter from './routes/inventory-overview.js';
import inventoryMatrixRouter from './routes/inventory-matrix.js';
import productStockRouter from './routes/product-stock.js';
import dailyInventoryRouter from './routes/daily-inventory.js';
import productionTpoRouter from './routes/production-tpo.js';
import productionSurfaceRouter from './routes/production-surface.js';
import productionPrimerRouter from './routes/production-primer.js';
import productionEmbossRouter from './routes/production-emboss.js';
import productionCuttingRouter from './routes/production-cutting.js';
import integratedInventoryRouter from './routes/integrated-inventory.js';
import tpoDetailRouter from './routes/tpo-detail.js';
import materialInboundRouter, { exportExcel as materialInboundExportExcel, listHandler as materialInboundList } from './routes/material-inbound.js';
import deliveryVehicleRouter from './routes/delivery-vehicle.js';
import deliveryFinishedProductRouter, { listHandler as deliveryFinishedProductList } from './routes/delivery-finished-product.js';
import deliverySemiProductRouter, { listHandler as deliverySemiProductList } from './routes/delivery-semi-product.js';
import deliverySupplierRouter, { listHandler as deliverySupplierList } from './routes/delivery-supplier.js';
import deliveryAffiliateRouter, { listHandler as deliveryAffiliateList } from './routes/delivery-affiliate.js';
import deliveryWarehouseRouter, { listHandler as deliveryWarehouseList } from './routes/delivery-warehouse.js';
import deliveryRequestRouter, { listHandler as deliveryRequestList, exportExcel as deliveryRequestExportExcel } from './routes/delivery-request.js';
import masterFinishedProductRouter, { listHandler as masterFinishedProductList, exportExcel as masterFinishedProductExportExcel, templateDownload as masterFinishedProductTemplate } from './routes/master-finished-product.js';
import masterSemiProductRouter, { listHandler as masterSemiProductList, exportExcel as masterSemiProductExportExcel, templateDownload as masterSemiProductTemplate } from './routes/master-semi-product.js';
import chatRouter from './routes/chat.js';
import logger from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const projectRoot = path.join(__dirname, '..');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/health', healthRouter);
app.use('/api/member', memberRouter);
app.use('/api/material', materialRouter);
app.get('/api/material-suppliers', materialSupplierList);
app.use('/api/material-suppliers', materialSupplierRouter);
app.use('/api/material-warehouses', materialWarehouseRouter);
app.use('/api/material-stock', materialStockRouter);
app.use('/api/inventory-overview', inventoryOverviewRouter);
app.use('/api/inventory-matrix', inventoryMatrixRouter);
app.use('/api/product-stock', productStockRouter);
app.use('/api/daily-inventory', dailyInventoryRouter);
app.use('/api/production-tpo', productionTpoRouter);
app.use('/api/production-surface', productionSurfaceRouter);
app.use('/api/production-primer', productionPrimerRouter);
app.use('/api/production-emboss', productionEmbossRouter);
app.use('/api/production-cutting', productionCuttingRouter);
app.use('/api/integrated-inventory', integratedInventoryRouter);
app.use('/api/tpo-detail', tpoDetailRouter);
app.get('/api/material-inbound/export-excel', materialInboundExportExcel);
app.get('/api/material-inbound', materialInboundList);
app.use('/api/material-inbound', materialInboundRouter);
app.get('/api/master-finished-products/template', masterFinishedProductTemplate);
app.get('/api/master-finished-products/export-excel', masterFinishedProductExportExcel);
app.get('/api/master-finished-products', masterFinishedProductList);
app.use('/api/master-finished-products', masterFinishedProductRouter);
app.get('/api/master-semi-products/template', masterSemiProductTemplate);
app.get('/api/master-semi-products/export-excel', masterSemiProductExportExcel);
app.get('/api/master-semi-products', masterSemiProductList);
app.use('/api/master-semi-products', masterSemiProductRouter);
app.use('/api/chat', chatRouter);

app.use('/api/delivery-vehicles', deliveryVehicleRouter);
app.get('/api/delivery-finished-products', deliveryFinishedProductList);
app.use('/api/delivery-finished-products', deliveryFinishedProductRouter);
app.get('/api/delivery-semi-products', deliverySemiProductList);
app.use('/api/delivery-semi-products', deliverySemiProductRouter);
app.get('/api/delivery-suppliers', deliverySupplierList);
app.use('/api/delivery-suppliers', deliverySupplierRouter);
app.get('/api/delivery-affiliates', deliveryAffiliateList);
app.use('/api/delivery-affiliates', deliveryAffiliateRouter);
app.get('/api/delivery-warehouses', deliveryWarehouseList);
app.use('/api/delivery-warehouses', deliveryWarehouseRouter);
app.get('/api/delivery-requests/export-excel', deliveryRequestExportExcel);
app.get('/api/delivery-requests', deliveryRequestList);
app.use('/api/delivery-requests', deliveryRequestRouter);

function mountErrorHandler() {
  // eslint-disable-next-line no-unused-vars -- Express error handler signature
  app.use((err, req, res, next) => {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Internal Server Error' });
  });
}

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    await initDb();

    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(projectRoot, 'dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(projectRoot, 'dist/index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        root: projectRoot,
        appType: 'spa',
        server: { middlewareMode: true },
      });
      app.use(vite.middlewares);
    }

    mountErrorHandler();

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        mode: process.env.NODE_ENV === 'production' ? 'production' : 'development+vite',
      });
    });
  })();
} else {
  mountErrorHandler();
}

export default app;
