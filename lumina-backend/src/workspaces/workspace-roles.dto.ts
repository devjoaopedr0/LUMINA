import { IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveWorkspaceRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(240)
  description = '';

  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}

export class SetRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}
