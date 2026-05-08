export const PLANS = {
  TRIAL: {
    name: "Trial",
    price: 0,
    maxPhoneNumbers: 1,
    maxMinutesPerMonth: 30,
    maxFaqs: 10,
  },
  STARTER: {
    name: "Starter",
    price: 9800,
    maxPhoneNumbers: 1,
    maxMinutesPerMonth: 100,
    maxFaqs: 50,
  },
  BUSINESS: {
    name: "Business",
    price: 29800,
    maxPhoneNumbers: 3,
    maxMinutesPerMonth: 500,
    maxFaqs: 200,
  },
  PRO: {
    name: "Pro",
    price: 79800,
    maxPhoneNumbers: 10,
    maxMinutesPerMonth: 2000,
    maxFaqs: -1,
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: -1,
    maxPhoneNumbers: -1,
    maxMinutesPerMonth: -1,
    maxFaqs: -1,
  },
} as const;

export const INQUIRY_CATEGORIES = [
  "予約",
  "問い合わせ",
  "担当者取次",
  "クレーム",
  "営業電話",
  "その他",
] as const;

export const RESPONSE_METHODS = [
  "FAQで回答",
  "参考資料を参照してAI回答",
  "必要項目を聞き取って折り返し受付",
  "担当者に転送",
  "通知だけ送る",
] as const;

export const ADDITIONAL_MINUTE_PRICE = 30;
export const ADDITIONAL_PHONE_NUMBER_PRICE = 1000;
