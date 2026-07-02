import { Injectable } from '@nestjs/common';
import { MediaAssetRepository } from './mediaAsset.repository';
import type { CreateMediaAssetDto } from './dto/create-mediaAsset.dto';

@Injectable()
export class MediaAssetService {
  constructor(private readonly repository: MediaAssetRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateMediaAssetDto) { return this.repository.create(dto); }
}
