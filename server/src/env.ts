import path from 'node:path';

try {
    process.loadEnvFile();
} catch {
    // No .env file — rely on the real environment.
}

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable ${name}`);
    return value;
}

// Vercel runs the API as short-lived functions with no persistent disk.
const serverless = Boolean(process.env.VERCEL);

export const env = {
    port: Number(process.env.PORT ?? 4000),
    jwtSecret: required('JWT_SECRET'),
    serverless,
    cronSecret: process.env.CRON_SECRET ?? '',
    uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
    /** 'disk' keeps uploads in UPLOAD_DIR; 'database' stores them in the database (default on Vercel). */
    fileStorage: (process.env.FILE_STORAGE ?? (serverless ? 'database' : 'disk')) as 'disk' | 'database',
    /** Vercel rejects request bodies over 4.5 MB, so uploads there are capped lower. */
    maxUploadBytes: (serverless ? 4 : 25) * 1024 * 1024,
    postgres: /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? ''),
    smtp: {
        host: process.env.SMTP_HOST ?? '',
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
        from: process.env.SMTP_FROM ?? 'TaskFlow <no-reply@taskflow.local>',
    },
};
