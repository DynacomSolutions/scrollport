export const CHUNK = 500
export const ROW_H = 32
export const COL_W = 130
export const COLS = [
  'id','username','avatarUrl','fullName','email','role','department','country','city','status',
  'plan','signupDate','lastLoginAt','website','profileUrl','company','orders','sessions',
  'conversionRate','revenue','balance','mrr','arr','expense','score','ticketsOpen','renewalDate',
]
export const TOKEN_COL = 1
export const VARIANTS = {
  'cv-full': [10_000, 100_000, 300_000, 1_000_000],
  'uf-text': [100_000, 1_000_000, 3_000_000],
  'uf-cells': [100_000, 300_000, 1_000_000],
}
export const token = (i) => 'QX7R' + String(i).padStart(7, '0')
export const targetIndex = (n) => n - 10
