import { Injectable } from '@nestjs/common';
import { IncentiveEventRepository } from './incentiveEvent.repository';
import type { CreateIncentiveEventDto } from './dto/create-incentiveEvent.dto';

@Injectable()
export class IncentiveEventService {
  constructor(private readonly repository: IncentiveEventRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateIncentiveEventDto) { return this.repository.create(dto); }
}
