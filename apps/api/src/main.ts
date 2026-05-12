import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // CORS aceita lista de origens separadas por vírgula em `WEB_ORIGIN`.
  // Necessário em produção pois Vercel atribui múltiplos aliases ao mesmo
  // projeto (ex.: `argus-cbmes.vercel.app` + `argus-cbmes-team.vercel.app`).
  const webOriginEnv = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
  const allowedOrigins = webOriginEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const port = Number(config.get<string>('PORT') ?? 3000);

  app.use(cookieParser());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚒 ARGUS CBMES API listening on http://localhost:${port}`);
}

bootstrap();
