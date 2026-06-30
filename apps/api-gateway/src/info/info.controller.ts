import { Controller, Get } from '@nestjs/common';

@Controller()
export class InfoController {
  @Get() info(): { service: string; status: string } {
    return { service: 'api-gateway', status: 'running' };
  }
}
