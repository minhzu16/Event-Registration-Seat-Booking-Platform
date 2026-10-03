import pino from 'pino';
import { config } from './config.js';

const isProduction = config.NODE_ENV === 'production';

export const logger = pino({
  level: config.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export default logger;
