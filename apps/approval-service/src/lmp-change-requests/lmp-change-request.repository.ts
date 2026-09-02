import type { PrismaService } from '../prisma/prisma.service';
import type { CreateLmpChangeRequestInput } from './dto/create-lmpChangeRequest.dto';

/**
 * Data access for LMP_CHANGE approval requests. LMP_CHANGE has no table of
 * its own (see quick-response.service.ts's getLmpChangeRequestDetail) — this
 * scopes every query to `approval_requests` rows with `requestType:
 * 'LMP_CHANGE'`, the same table `ApprovalRequestRepository` owns generically.
 */
export class LmpChangeRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds an LMP change request previously created from this exact
   * client-generated localRequestUuid — lets create() treat a
   * dropped-connection retry as an idempotent replay instead of a new row.
   * `localRequestUuid` is globally unique across all approval_requests (not
   * just LMP_CHANGE ones), so a plain findUnique is enough.
   */
  findByLocalRequestUuid(localRequestUuid: string) {
    return this.prisma.approvalRequest.findUnique({ where: { localRequestUuid } });
  }

  create(data: {
    beneficiaryId: string;
    requestedByUserId: string;
    decisionStatusLookupId: string;
    requestPayloadJson: CreateLmpChangeRequestInput;
    localRequestUuid: string;
  }) {
    return this.prisma.approvalRequest.create({
      data: {
        requestType: 'LMP_CHANGE',
        beneficiaryId: data.beneficiaryId,
        sourceEntityType: 'BeneficiaryCase',
        sourceEntityId: data.beneficiaryId,
        requestedByUserId: data.requestedByUserId,
        decisionStatusLookupId: data.decisionStatusLookupId,
        requestPayloadJson: {
          newLmpDate: data.requestPayloadJson.newLmpDate.toISOString(),
          sonographyImageAssetId: data.requestPayloadJson.sonographyImageAssetId ?? null,
        },
        localRequestUuid: data.localRequestUuid,
      },
    });
  }

  /**
   * All LMP_CHANGE approval requests raised for one beneficiary,
   * most-recent-first — lets the Sakhi app poll for status without a
   * separate polling resource. A beneficiary with no LMP change requests
   * returns an empty array, not an error.
   */
  findByBeneficiaryId(beneficiaryId: string) {
    return this.prisma.approvalRequest.findMany({
      where: { requestType: 'LMP_CHANGE', beneficiaryId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }
}
