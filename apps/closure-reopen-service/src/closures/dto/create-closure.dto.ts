import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClosureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
