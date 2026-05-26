import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PlanType } from "@prisma/client";

/**
 * 運営者が企業を新規発行するときの入力。
 * 初代 ADMIN ユーザーを同時に作成し、招待リンクを返す。
 */
export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** 初代 ADMIN のメールアドレス */
  @IsEmail()
  adminEmail!: string;

  /** 初代 ADMIN の表示名 */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  adminName!: string;

  @IsEnum(PlanType)
  planType!: PlanType;

  /** 月額料金（PAID のときのみ意味がある。TRIAL は 0 で渡す） */
  @IsInt()
  @Min(0)
  monthlyPrice!: number;

  /** 月間通話分数上限 */
  @IsInt()
  @Min(0)
  maxMinutesPerMonth!: number;

  /**
   * プランの期限日（TRIAL の終了日 / PAID の契約終了日として使う）。
   * 内部的には Subscription.trialEndsAt カラムに保存。
   */
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string | null;
}
