import { IsOptional, IsString } from "class-validator";

/**
 * 会社ユーザーが運営管理者へ送る電話番号追加リクエスト。
 * Twilio 番号の購入・在庫登録・割当は運営管理者が admin 画面で行う。
 */
export class CreatePhoneNumberRequestDto {
  /** リクエスト元の会社ID */
  @IsString()
  companyId: string;

  /** 希望条件や用途のメモ（例: "予約受付用に1番号追加したい"） */
  @IsOptional()
  @IsString()
  note?: string;
}

