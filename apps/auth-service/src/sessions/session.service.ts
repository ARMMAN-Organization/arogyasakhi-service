import { Injectable } from '@nestjs/common';
import { SessionRepository } from './session.repository';
import type { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionService {
  constructor(private readonly repository: SessionRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateSessionDto) { return this.repository.create(dto); }
}
