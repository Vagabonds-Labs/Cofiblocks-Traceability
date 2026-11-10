import cors from 'cors';
import 'dotenv/config';
import 'express-async-errors';
import cookieParser from 'cookie-parser';
import express from 'express';

import healthRoute from './routes/health';
import usersRoute from './routes/users';
import notificationsRoute from './routes/notifications';
import authRoute from './routes/auth';
import adminRoute from './routes/admin';
import configRoute from './routes/config';
import organizationsRoute from './routes/organizations';
import { startTelegramBot } from './bot';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { withLogger } from './middleware/logger';
import { logger } from './lib/logger';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(requestId);
app.use(withLogger);

// Frontend origins. `FRONTEND_URL` adds each environment's origin (staging).
const allowedOrigins = [
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

function isAllowedPreviewOrigin(origin: string) {
  return origin.endsWith(".vercel.app");
}

const isProduction = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl / webhooks
      if (!origin) return callback(null, true);

      // Always allow explicit trusted origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow ALL Vercel preview URLs in non-prod
      if (!isProduction && isAllowedPreviewOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

app.options("*", cors());

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  req.log.info("******************* Incoming request *******************");
  req.log.info("Request for: " + req.method + " " + req.url);

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      req.log.info(`Response Status: ${res.statusCode}`);
    }
    req.log.info("******************* Request completed *******************");
  });

  next();
});


// APIs
app.use("/api/health", healthRoute);
app.use("/api/users", usersRoute);
app.use("/api/notifications", notificationsRoute);
app.use("/api/auth", authRoute);
app.use("/api/admin", adminRoute);
app.use("/api/config", configRoute);
app.use("/api/organizations", organizationsRoute);

async function main() {
  // The bot webhook is registered before the error handler.
  await startTelegramBot(app);

  // Error handling middleware (must be last)
  app.use(errorHandlerMiddleware);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Server failed to start');
  process.exit(1);
});
