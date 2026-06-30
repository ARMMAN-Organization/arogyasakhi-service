import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSyncBatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
