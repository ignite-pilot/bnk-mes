/**
 * Winston 로거: 콘솔 출력 + CloudWatch 전송 (설정 시)
 * - CLOUDWATCH_LOG_GROUP 설정 시 해당 로그 그룹으로 전송
 * - AWS 인증: IAM 역할 또는 AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */
import { createRequire } from 'module';
import winston from 'winston';

const require = createRequire(import.meta.url);
const CloudWatchTransport = require('winston-cloudwatch');

const { combine, timestamp, printf, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `${ts} [${level}] ${message}${metaStr}${stackStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  defaultMeta: { service: 'bnk-mes' },
  transports: [
    new winston.transports.Console({
      format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    }),
  ],
});

const logGroupName = process.env.CLOUDWATCH_LOG_GROUP;
const logRegion = process.env.AWS_REGION || process.env.CLOUDWATCH_REGION;

if (logGroupName) {
  try {
    logger.add(
      new CloudWatchTransport({
        logGroupName,
        logStreamName: process.env.CLOUDWATCH_LOG_STREAM || `bnk-mes-${Date.now()}`,
        awsRegion: logRegion || 'ap-northeast-2',
        messageFormatter: ({ level, message, timestamp: ts, stack, ...meta }) => {
          const obj = { level, message, timestamp: ts, ...meta };
          if (stack) obj.stack = stack;
          return JSON.stringify(obj);
        },
      })
    );
  } catch (err) {
    logger.warn('CloudWatch transport failed to init', { error: err.message });
  }
}

export default logger;
