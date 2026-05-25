import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from "class-validator";
import { PlanType } from "@prisma/client";

/**
 * 運営者が会社ごとに上書きする「プラン詳細」。
 * Plan テーブルは TRIAL / PAID の2種類しかなく、料金や上限は Subscription 側に持つ。
 */
export class UpdateCompanyPlanDto {
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

  /** トライアル期限日（TRIAL のときのみ。PAID なら null） */
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string | null;
}
