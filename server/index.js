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
import materialInboundRouter, { exportExcel as materialInboundExportExcel, listHandler as materialInboundList } from './routes/material-inbound.js';
import deliveryVehicleRouter from './routes/delivery-vehicle.js';
import deliveryFinishedProductRouter, { listHandler as deliveryFinishedProductList } from './routes/delivery-finished-product.js';
import deliverySemiProductRouter, { listHandler as deliverySemiProductList } from './routes/delivery-semi-product.js';
import deliverySupplierRouter, { listHandler as deliverySupplierList } from './routes/delivery-supplier.js';
import deliveryAffiliateRouter, { listHandler as deliveryAffiliateList } from './routes/delivery-affiliate.js';
import deliveryWarehouseRouter, { listHandler as deliveryWarehouseList } from './routes/delivery-warehouse.js';
import deliveryRequestRouter, { listHandler as deliveryRequestList, exportExcel as deliveryRequestExportExcel } from './routes/delivery-request.js';
import logger from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

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
app.get('/api/material-inbound/export-excel', materialInboundExportExcel);
app.get('/api/material-inbound', materialInboundList);
app.use('/api/material-inbound', materialInboundRouter);

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

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    await initDb();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  })();
}

export default app;
