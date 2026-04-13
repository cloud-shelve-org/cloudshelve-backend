import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/auth.routes';
import legalRoutes from './routes/legal.routes';
import providersRoutes from './routes/providers.routes';
import filesRoutes from './routes/files.routes';
import jobsRoutes from './routes/jobs.routes';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

// Trust Railway's (and other reverse proxies') forwarded headers so that
// req.protocol returns 'https' instead of 'http' behind the load balancer.
app.set('trust proxy', true);

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/jobs',  jobsRoutes);

app.use(errorMiddleware);

export default app;
