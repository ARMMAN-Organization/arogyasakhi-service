import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/** Validated payload for creating a beneficiary case. */
export class CreateBeneficiaryDto {
  @IsIn(['MOTHER', 'CHILD'])
  caseType!: 'MOTHER' | 'CHILD';

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsUUID()
  projectId!: string;
}
