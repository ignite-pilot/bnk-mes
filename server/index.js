import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import healthRouter from './routes/health.js';
import memberRouter from './routes/member.js';
import materialRouter from './routes/material.js';
import materialSupplierRouter, { listHandler as materialSupplierList } from './routes/material-supplier.js';
import materialWarehouseRouter from './routes/material-warehouse.js';
import materialStockRouter from './routes/material-stock.js';
import materialInboundRouter, { exportExcel as materialInboundExportExcel, listHandler as materialInboundList } from './routes/material-inbound.js';
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
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

export default app;
