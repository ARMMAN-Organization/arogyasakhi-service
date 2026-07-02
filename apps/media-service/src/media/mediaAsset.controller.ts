import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { MediaAssetService } from './mediaAsset.service';
import { CreateMediaAssetDto } from './dto/create-mediaAsset.dto';

@Controller('media')
export class MediaAssetController {
  constructor(private readonly service: MediaAssetService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateMediaAssetDto) { return this.service.create(dto); }
}
