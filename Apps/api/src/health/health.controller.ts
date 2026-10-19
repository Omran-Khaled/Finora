import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponse, apiError } from '../swagger/schemas';
import { PrismaService } from '../database/prisma.service';
import { resolvePersistencyMode, PersistencyMode } from '../config/persistence';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns `200 OK` with a static payload as soon as the process is able to respond. Use it for load balancers and uptime monitors.',
    operationId: 'health',
  })
  @ApiOkResponse({ description: 'The API is up and responding.', type: HealthResponse })
  @Get('health')
  health(): { data: { status: 'ok' } } {
    return { data: { status: 'ok' } };
  }

  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Returns `200 OK` when the process is bootstrapped AND its persistence layer answers. With `ENABLE_PRISMA=true` the probe issues a cheap `SELECT 1`; an unreachable database answers `503 SERVICE_UNAVAILABLE` so orchestrators stop routing traffic. In memory mode the payload is static.',
    operationId: 'ready',
  })
  @ApiOkResponse({ description: 'The API is ready to serve traffic.', type: HealthResponse })
  @ApiResponse(apiError(503, 'The database is unreachable.', 'SERVICE_UNAVAILABLE', 'The database is unreachable. Please try again later.'))
  @Get('ready')
  async ready(): Promise<{ data: { status: 'ok'; database?: 'ok' | 'disabled' } }> {
    const mode = resolvePersistencyMode();
    if (mode === PersistencyMode.PRISMA) {
      try {
        await this.prisma.db.$queryRaw`SELECT 1`;
        return { data: { status: 'ok', database: 'ok' } };
      } catch {
        throw new ServiceUnavailableException({ code: 'SERVICE_UNAVAILABLE', message: 'The database is unreachable. Please try again later.' });
      }
    }
    return { data: { status: 'ok', database: 'disabled' } };
  }
}
