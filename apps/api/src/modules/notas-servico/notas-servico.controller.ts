import {
  BadRequestException,
  Body,
  ConflictException,
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
import { ServicoService } from '../servico/servico.service';
import { bloqueiosToMessage, computeBloqueios } from '../servico/bloqueio-reimport';

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
  constructor(
    private readonly notas: NotasServicoService,
    private readonly servico: ServicoService,
  ) {}

  /**
   * S2.3 — guarda contra escrita em dia em uso. Aplicado em create/update/delete.
   * Para update/delete, valida tanto a data ATUAL da NS quanto a NOVA data
   * (caso o user mude a data — protege ambas as pontas).
   */
  private assertDataLivre(...datas: ReadonlyArray<string | undefined>): void {
    const datasUnicas = [...new Set(datas.filter((d): d is string => Boolean(d)))];
    const bloqueios = computeBloqueios(this.servico, datasUnicas);
    if (bloqueios.length > 0) {
      throw new ConflictException({
        message: bloqueiosToMessage(bloqueios),
        bloqueios,
      });
    }
  }

  @Get()
  async list(@Query() query: unknown): Promise<NotaServico[]> {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.list(parsed.data);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<NotaServico> {
    return this.notas.findById(id);
  }

  /**
   * S6l — POST aceita admin/sargenteante/fiscal porque NS pode ser
   * cadastrada em 2 fluxos (módulo, ajuste pré-turno).
   */
  @Roles('admin', 'sargenteante', 'fiscal')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: UserSession): Promise<NotaServico> {
    const parsed = createNotaServicoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    this.assertDataLivre(parsed.data.data);
    return this.notas.createOrConflict(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<NotaServico> {
    const parsed = updateNotaServicoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const atual = await this.notas.findById(id);
    this.assertDataLivre(atual.data, parsed.data.data);
    return this.notas.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    const atual = await this.notas.findById(id);
    this.assertDataLivre(atual.data);
    await this.notas.remove(id);
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
