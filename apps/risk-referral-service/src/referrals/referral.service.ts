import { Injectable } from '@nestjs/common';
import { ReferralRepository } from './referral.repository';
import type { CreateReferralDto } from './dto/create-referral.dto';

@Injectable()
export class ReferralService {
  constructor(private readonly repository: ReferralRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateReferralDto) { return this.repository.create(dto); }
}
