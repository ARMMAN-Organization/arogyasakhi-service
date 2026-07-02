import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateVisitInstanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
