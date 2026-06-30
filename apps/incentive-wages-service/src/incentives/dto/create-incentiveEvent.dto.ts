import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateIncentiveEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
