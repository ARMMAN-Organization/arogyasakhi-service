import { Injectable } from '@nestjs/common';
import { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceDto } from './dto/create-visitInstance.dto';

@Injectable()
export class VisitInstanceService {
  constructor(private readonly repository: VisitInstanceRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateVisitInstanceDto) { return this.repository.create(dto); }
}
