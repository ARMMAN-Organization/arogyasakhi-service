import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMediaAssetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
