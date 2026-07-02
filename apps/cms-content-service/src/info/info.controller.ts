import { Controller, Get } from '@nestjs/common';

@Controller()
export class InfoController {
  @Get() info(): { service: string; status: string } {
    return { service: 'cms-content-service', status: 'running' };
  }
}
