import './config/env'; // validates env vars on startup
import app from './app';
import { env } from './config/env';
import { startJobsWorker } from './workers/jobs.worker';

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

startJobsWorker();
