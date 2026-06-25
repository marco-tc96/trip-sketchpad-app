// Common currency list
export const CURRENCIES = [
  "EUR","USD","GBP","JPY","CHF","CAD","AUD","NZD","CNY","HKD","SGD","KRW",
  "INR","THB","IDR","MYR","VND","PHP","TWD","AED","SAR","TRY","ILS","EGP",
  "ZAR","BRL","ARS","CLP","MXN","COP","PEN","NOK","SEK","DKK","ISK","PLN",
  "CZK","HUF","RON","BGN","HRK","UAH","RUB","RSD","MAD","KES","NGN",
] as const;

export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(
  amount: number,
  currency: string,
  locale = "en-US",
) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}