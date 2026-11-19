import type { CorsOptions } from 'cors';
import { config } from './config.js';

// Only the configured browser origins may call the API; any other origin gets no CORS headers.
export const corsOptions: CorsOptions = {
  origin: config.CORS_ORIGIN_LIST,
  credentials: true,
};
