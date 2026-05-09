import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { PreviewEscalaResponse } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserSession } from '@argus/shared-types';
import { EscalasService, computeDiff } from './escalas.service';
import { EscalaXlsxParseError, parseEscalaXlsx } from './escala-xlsx-parser';

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

const escaladosDoDiaSchema = z.object({
  ano: z.string().regex(/^\d{4}$/),
  mes: z.string().regex(/^\d{1,2}$/),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function ensureXlsx(file: MulterFile | undefined): MulterFile {
  if (!file) {
    throw new BadRequestException('Arquivo obrigatório no campo "file" (multipart/form-data).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(
      `Arquivo grande demais (${file.size} bytes). Limite: ${MAX_UPLOAD_BYTES} bytes.`,
    );
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Apenas arquivos .xlsx são aceitos.');
  }
  return file;
}

@Controller('escalas')
export class EscalasController {
  constructor(private readonly escalas: EscalasService) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const { ano, mes } = parsed.data;
    if (ano && mes) {
      const escala = this.escalas.get(Number.parseInt(ano, 10), Number.parseInt(mes, 10));
      if (!escala) return { escala: null };
      return { escala };
    }
    return this.escalas.list();
  }

  @Get('escalados-do-dia')
  escaladosDoDia(@Query() query: unknown) {
    const parsed = escaladosDoDiaSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const ano = Number.parseInt(parsed.data.ano, 10);
    const mes = Number.parseInt(parsed.data.mes, 10);
    return this.escalas.getEscaladosDoDia(ano, mes, parsed.data.data);
  }

  /**
   * Parseia o XLSX, retorna o preview da escala (sem persistir) e, se já existe uma
   * escala vigente para aquele mês, retorna o diff a ser confirmado.
   */
  @Roles('admin', 'sargenteante')
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async preview(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: UserSession,
  ): Promise<PreviewEscalaResponse> {
    const upload = ensureXlsx(file);
    let escala;
    try {
      escala = await parseEscalaXlsx({
        buffer: upload.buffer,
        filename: upload.originalname,
        importadoPorNf: user.nf,
      });
    } catch (err) {
      if (err instanceof EscalaXlsxParseError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    const vigente = this.escalas.get(escala.ano, escala.mes);
    const diff = vigente ? computeDiff(vigente, escala) : null;
    return { escala, diff };
  }

  /**
   * Persiste a escala mensal. Aceita o objeto EscalaMensal devolvido pelo preview —
   * idealmente o frontend repassa o mesmo body (com a confirmação do usuário).
   */
  @Roles('admin', 'sargenteante')
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() body: unknown) {
    // Validação leve: aceita apenas o shape esperado.
    const schema = z.object({
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2024).max(2100),
      origemArquivo: z.string(),
      importadoEm: z.string(),
      importadoPorNf: z.string().optional(),
      diaEquipe: z.record(z.string(), z.enum(['A', 'B', 'C', 'D'])),
      composicao: z.array(
        z.object({
          equipe: z.enum(['A', 'B', 'C', 'D']),
          viatura: z.string(),
          funcao: z.string(),
          militar: z.object({
            raw: z.string(),
            postoAbreviado: z.string(),
            nomeGuerra: z.string(),
            nf: z.string().optional(),
          }),
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

  /**
   * F4 — Atualiza/remove a equipe escalada para um dia específico.
   * Body: `{data: 'YYYY-MM-DD', equipe: 'A'|'B'|'C'|'D' | null}`
   */
  @Roles('admin', 'sargenteante')
  @Put(':ano/:mes/dia-equipe')
  updateDiaEquipe(@Param('ano') ano: string, @Param('mes') mes: string, @Body() body: unknown) {
    const schema = z.object({
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      equipe: z.enum(['A', 'B', 'C', 'D']).nullable(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const a = Number.parseInt(ano, 10);
    const m = Number.parseInt(mes, 10);
    try {
      return this.escalas.updateDiaEquipe(a, m, parsed.data.data, parsed.data.equipe);
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }

  /**
   * F4 — Upsert/remove de uma posição da composição (equipe × viatura × função).
   * Body: `{equipe, viatura, funcao, militar: MilitarRef | null}` (null = remove)
   */
  @Roles('admin', 'sargenteante')
  @Put(':ano/:mes/composicao')
  upsertComposicao(@Param('ano') ano: string, @Param('mes') mes: string, @Body() body: unknown) {
    const schema = z.object({
      equipe: z.enum(['A', 'B', 'C', 'D', 'AQUATICAS', 'STAFF']),
      viatura: z.string(),
      funcao: z.string(),
      militar: z
        .object({
          raw: z.string(),
          postoAbreviado: z.string(),
          nomeGuerra: z.string(),
          nf: z.string().optional(),
        })
        .nullable(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const a = Number.parseInt(ano, 10);
    const m = Number.parseInt(mes, 10);
    try {
      return this.escalas.upsertComposicao(a, m, parsed.data);
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }
}
