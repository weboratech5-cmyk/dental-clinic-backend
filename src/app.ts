import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { patientRouter } from './routes/patient.routes.js';
import { visitRouter } from './routes/visit.routes.js';
import { medicationRouter } from './routes/medication.routes.js';
import { prescriptionRouter } from './routes/prescription.routes.js';
import { investigationRouter } from './routes/investigation.routes.js';
import { appointmentRouter } from './routes/appointment.routes.js';
import { medicineRouter } from './routes/medicine.routes.js';
import { pharmacyRouter } from './routes/pharmacy.routes.js';
import { consultationRouter } from './routes/consultation.routes.js';
import { billingRouter } from './routes/billing.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { staffRouter } from './routes/staff.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');

export const app = express();

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/patients', patientRouter);
app.use('/api/visits', visitRouter);
app.use('/api/medications', medicationRouter);
app.use('/api/prescriptions', prescriptionRouter);
app.use('/api/investigations', investigationRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/medicines', medicineRouter);
app.use('/api/pharmacy', pharmacyRouter);
app.use('/api/consultation-payments', consultationRouter);
app.use('/api/billing', billingRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/dashboard', dashboardRouter);

// Serve frontend static build files
app.use(express.static(distPath));

// Fallback all non-API GET requests to React index.html
app.get('*', (request, response, next) => {
  if (request.path.startsWith('/api')) {
    response.status(404).json({ status: 'error', message: 'Route not found' });
    return;
  }
  response.sendFile(path.join(distPath, 'index.html'));
});

app.use(errorHandler);
