import type { MediaAssetRepository } from './mediaAsset.repository';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';

/** Media asset domain logic. Data access is delegated to the repository. */
export class MediaAssetService {
  constructor(private readonly repository: MediaAssetRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateMediaAssetInput) {
    return this.repository.create(dto);
  }
}
