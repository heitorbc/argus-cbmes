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
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import {
  createNotaServicoInputSchema,
  updateNotaServicoInputSchema,
  type NotaServico,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { parseNotaServicoPdf, type ParseNotaServicoPdfResult } from './nota-servico-pdf-parser';
import { NotasServicoService } from './notas-servico.service';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

const listQuerySchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  militarNf: z.string().optional(),
});

@Controller('notas-servico')
export class NotasServicoController {
  constructor(private readonly notas: NotasServicoService) {}

  @Get()
  list(@Query() query: unknown): NotaServico[] {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.list(parsed.data);
  }

  @Get(':id')
  findById(@Param('id') id: string): NotaServico {
    return this.notas.findById(id);
  }

  /**
   * S6l — POST aceita admin/sargenteante/fiscal porque NS pode ser
   * cadastrada em 2 fluxos (módulo, ajuste pré-turno).
   */
  @Roles('admin', 'sargenteante', 'fiscal')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown, @CurrentUser() user: UserSession): NotaServico {
    const parsed = createNotaServicoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.createOrConflict(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): NotaServico {
    const parsed = updateNotaServicoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.notas.remove(id);
  }

  /**
   * S6m — Importa PDF institucional de Nota de Serviço e devolve um preview
   * com sugestões editáveis (codigo, descrição, militares NFs, viatura, data,
   * hora). O frontend mostra esses sugeridos no formulário e o user
   * confirma/edita antes do POST normal.
   *
   * Não persiste — apenas extrai e devolve. Persistência é via POST normal.
   */
  @Roles('admin', 'sargenteante', 'fiscal')
  @Post('preview-pdf')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }))
  async previewPdf(@UploadedFile() file: MulterFile): Promise<ParseNotaServicoPdfResult> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório no campo "file" (multipart/form-data).');
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new BadRequestException(
        `PDF grande demais (${file.size} bytes). Limite: ${MAX_PDF_BYTES} bytes.`,
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Apenas arquivos .pdf são aceitos.');
    }
    try {
      return await parseNotaServicoPdf(file.buffer);
    } catch (err) {
      throw new BadRequestException(`Falha ao parsear PDF: ${(err as Error).message}`);
    }
  }
}
