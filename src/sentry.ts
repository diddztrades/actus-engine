import * as Sentry from "@sentry/react";
import { ENV } from "./config/env";

let sentryInitialized = false;

export function initSentry() {
  if (sentryInitialized || typeof window === "undefined" || !ENV.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    environment: ENV.APP_ENV || import.meta.env.MODE,
    tracesSampleRate: 0,
  });

  sentryInitialized = true;
}

export { Sentry };
