import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.colorize(),
    transports: [
        new (winston.transports.Console)({
            level: 'debug',
            format: winston.format.simple(),
        }),
    ],
    silent: false,
});

export { logger };
