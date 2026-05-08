import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
  const port = Number(config.get<string>('PORT') ?? 3000);

  app.use(cookieParser());

  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚒 ARGUS CBMES API listening on http://localhost:${port}`);
}

bootstrap();
