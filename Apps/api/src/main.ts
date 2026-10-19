import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./core/api-exception.filter";
import { validateProductionConfiguration } from "./config/production";
import { PrismaService } from "./database/prisma.service";
import { configureSwagger } from "./swagger/setup";

function loadEnvironment(): void {
  const envPath = resolve(__dirname, "../../.env");
  if (!existsSync(envPath)) return;

  // Precedence: explicitly provided process.env values always win over the file.
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

async function bootstrap(): Promise<void> {
  loadEnvironment();
  validateProductionConfiguration();
  const app = await NestFactory.create(AppModule);

  if (process.env.NODE_ENV === "production") {
    try {
      await app.get(PrismaService).assertReady();
    } catch {
      await app.close();
      throw new Error("Production startup aborted: database is not ready.");
    }
  }

  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable("x-powered-by");
  expressApp.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cache-Control", "no-store");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  // Behind a reverse proxy/load balancer the client IP must come from the
  // X-Forwarded-For chain; only enable it when the deployment says so.
  if (process.env.TRUST_PROXY === "true") {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }
  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const developmentOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
  ];
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? corsOrigins
      : [...new Set([...corsOrigins, ...developmentOrigins])];
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  configureSwagger(app);
  await app.listen(process.env.PORT ?? 5000);
}

void bootstrap();
