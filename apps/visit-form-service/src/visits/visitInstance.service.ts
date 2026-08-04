import { conflict } from '@armman/service-commons';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';

/** Visit instance domain logic. Data access is delegated to the repository. */
export class VisitInstanceService {
  constructor(private readonly repository: VisitInstanceRepository) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Idempotent by localVisitUuid (@unique) — mirrors form.service.ts's
   * createSubmission and beneficiary.service.ts's enroll pattern. Without
   * this, a retried offline visit upload hit P2002 on the unique constraint
   * and surfaced as an unhandled 500 rather than returning the original row;
   * on rural connections a retry is the norm, not the exception.
   */
  async create(dto: CreateVisitInstanceInput) {
    const existing = await this.repository.findByLocalVisitUuid(dto.localVisitUuid);
    if (existing) return existing;

    const schedule = await this.repository.findScheduleById(dto.scheduleId);
    if (!schedule) {
      throw conflict('scheduleId does not reference an existing visit schedule.');
    }

    return this.repository.create(dto);
  }
}
