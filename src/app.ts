import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/auth.routes';
import legalRoutes from './routes/legal.routes';
import providersRoutes from './routes/providers.routes';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

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

app.use(errorMiddleware);

export default app;
