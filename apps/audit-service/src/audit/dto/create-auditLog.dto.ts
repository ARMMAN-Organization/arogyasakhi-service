import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
