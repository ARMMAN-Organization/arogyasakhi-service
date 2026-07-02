import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRuleSetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
