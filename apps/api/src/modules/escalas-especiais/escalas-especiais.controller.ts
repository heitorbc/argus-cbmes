import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { PreviewEscalaEspecialResponse, UserSession } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EscalasEspeciaisService } from './escalas-especiais.service';
import { EscalaEspecialParseError, parseEscalaEspecialXlsm } from './escala-especial-xlsm-parser';

const listQuerySchema = z.object({
  ano: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  mes: z
    .string()
    .regex(/^\d{1,2}$/)
    .optional(),
});

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function ensureXlsm(file: MulterFile | undefined): MulterFile {
  if (!file) {
    throw new BadRequestException('Arquivo obrigatório no campo "file" (multipart/form-data).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(`Arquivo grande demais (${file.size} bytes).`);
  }
  const lower = file.originalname.toLowerCase();
  if (!lower.endsWith('.xlsm') && !lower.endsWith('.xlsx')) {
    throw new BadRequestException('Apenas arquivos .xlsm ou .xlsx são aceitos.');
  }
  return file;
}

@Controller('escalas-especiais')
export class EscalasEspeciaisController {
  constructor(private readonly escalas: EscalasEspeciaisService) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const { ano, mes } = parsed.data;
    if (ano && mes) {
      const escala = this.escalas.get(Number.parseInt(ano, 10), Number.parseInt(mes, 10));
      return { escala };
    }
    return this.escalas.list();
  }

  @Roles('admin', 'sargenteante')
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async preview(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: UserSession,
  ): Promise<PreviewEscalaEspecialResponse> {
    const upload = ensureXlsm(file);
    try {
      return await parseEscalaEspecialXlsm({
        buffer: upload.buffer,
        filename: upload.originalname,
        importadoPorNf: user.nf,
      });
    } catch (err) {
      if (err instanceof EscalaEspecialParseError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Roles('admin', 'sargenteante')
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() body: unknown) {
    const schema = z.object({
      mes: z.number().int().min(1).max(12),
      ano: z.number().int(),
      origemArquivo: z.string(),
      importadoEm: z.string(),
      importadoPorNf: z.string().optional(),
      atos: z.array(
        z.object({
          data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          militarRaw: z.string(),
          militarNf: z.string().optional(),
          horario: z.string(),
          funcao: z.string(),
        }),
      ),
      avisos: z.array(z.string()),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.escalas.save(parsed.data);
  }

  @Roles('admin')
  @Delete(':ano/:mes')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('ano') ano: string, @Param('mes') mes: string) {
    const a = Number.parseInt(ano, 10);
    const m = Number.parseInt(mes, 10);
    if (!Number.isFinite(a) || !Number.isFinite(m)) {
      throw new BadRequestException('ano/mês inválidos');
    }
    this.escalas.delete(a, m);
  }
}
