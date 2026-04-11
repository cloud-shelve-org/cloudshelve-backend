import dotenv from 'dotenv';
dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET', 'CREDENTIALS_ENCRYPTION_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL as string,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY as string,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  // OAuth provider credentials
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',
  DROPBOX_CLIENT_ID: process.env.DROPBOX_CLIENT_ID || '',
  DROPBOX_CLIENT_SECRET: process.env.DROPBOX_CLIENT_SECRET || '',
  BOX_CLIENT_ID: process.env.BOX_CLIENT_ID || '',
  BOX_CLIENT_SECRET: process.env.BOX_CLIENT_SECRET || '',
};
