import { Injectable } from '@nestjs/common';
import { ClosureRepository } from './closure.repository';
import type { CreateClosureDto } from './dto/create-closure.dto';

@Injectable()
export class ClosureService {
  constructor(private readonly repository: ClosureRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateClosureDto) { return this.repository.create(dto); }
}
