import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApprovalRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
