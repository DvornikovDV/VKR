import rateLimit from 'express-rate-limit';

export const commandRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Too many command requests. Please try again later.',
    },
});
