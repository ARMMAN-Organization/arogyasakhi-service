import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
