import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // graceful worker shutdown on SIGTERM/SIGINT

  const config = app.get(AppConfigService);

  // CORS: allow the configured frontend origins, plus any *.vercel.app preview
  // deployment. Token-based endpoints, so credentials are not needed.
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true); // curl / server-to-server / AT webhook
      const allowed =
        config.corsOrigins.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname);
      callback(null, allowed);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Worker-Token"],
  });

  // Bind to 0.0.0.0 and the platform-provided PORT (Render sets this).
  await app.listen(config.port, "0.0.0.0");
  new Logger("Bootstrap").log(`RentFlow backend listening on 0.0.0.0:${config.port}`);
}

void bootstrap();
