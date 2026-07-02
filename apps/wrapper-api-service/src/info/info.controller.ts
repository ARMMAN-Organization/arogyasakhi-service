import { Controller, Get } from '@nestjs/common';

@Controller()
export class InfoController {
  @Get() info(): { service: string; status: string } {
    return { service: 'wrapper-api-service', status: 'running' };
  }
}
