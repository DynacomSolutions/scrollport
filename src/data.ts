export type UserRecord = {
  id: number
  username: string
  avatarUrl: string
  fullName: string
  email: string
  role: string
  department: string
  country: string
  city: string
  status: 'Active' | 'Pending' | 'Suspended'
  plan: 'Free' | 'Starter' | 'Growth' | 'Enterprise'
  signupDate: string
  lastLoginAt: string
  website: string
  profileUrl: string
  company: string
  orders: number
  sessions: number
  conversionRate: number
  revenue: number
  balance: number
  mrr: number
  arr: number
  expense: number
  score: number
  ticketsOpen: number
  renewalDate: string
}

const firstNames = [
  'Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Elijah', 'Mia', 'Sophia', 'James', 'Lucas',
  'Amelia', 'Isabella', 'Ethan', 'Mason', 'Harper', 'Evelyn', 'Benjamin', 'Charlotte',
]

const lastNames = [
  'Turner', 'Rivera', 'Patel', 'Brooks', 'Nguyen', 'Bennett', 'Campbell', 'Morris',
  'Hughes', 'Parker', 'Edwards', 'Reed', 'Kelly', 'Diaz', 'Ward', 'Mitchell', 'Bailey',
]

const roles = [
  'Product Manager',
  'Sales Lead',
  'Account Executive',
  'Data Analyst',
  'Engineering Manager',
  'Support Specialist',
  'Finance Manager',
  'Marketing Strategist',
]

const departments = ['Product', 'Sales', 'Operations', 'Engineering', 'Finance', 'Marketing', 'Support']
const countries = ['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia', 'Netherlands']
const cities = ['New York', 'Toronto', 'London', 'Berlin', 'Sydney', 'Amsterdam', 'Austin', 'Chicago']
const statuses: UserRecord['status'][] = ['Active', 'Pending', 'Suspended']
const plans: UserRecord['plan'][] = ['Free', 'Starter', 'Growth', 'Enterprise']
const companies = [
  'Northwind Labs',
  'BluePeak Systems',
  'Summit Grid',
  'Cedar Analytics',
  'Harborline Tech',
  'Vertex Dynamics',
  'Atlas Commerce',
  'Pioneer Works',
]
const domains = ['example.com', 'acme.io', 'northwind.app', 'harborhq.com', 'bluepeak.co']

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

function between(min: number, max: number, rand: () => number): number {
  return min + (max - min) * rand()
}

// A fixed "now", so the demo shows the same rows on every load and a test can compute the expected text.
const NOW = Date.UTC(2026, 10, 23, 12, 0, 0)

function isoDate(offsetDays: number): string {
  return new Date(NOW - offsetDays * 86_400_000).toISOString().slice(0, 10)
}

function isoDateTime(offsetMinutes: number): string {
  return new Date(NOW - offsetMinutes * 60_000).toISOString()
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals
  return Math.round((value + Number.EPSILON) * scale) / scale
}

export function generateData(rowCount = 10_000): UserRecord[] {
  const rows: UserRecord[] = []

  for (let i = 1; i <= rowCount; i += 1) {
    const rand = mulberry32(i * 1299721)
    const first = pick(firstNames, rand)
    const last = pick(lastNames, rand)
    const username = `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(between(10, 999, rand))}`
    const domain = pick(domains, rand)
    const plan = pick(plans, rand)
    const revenue = roundTo(between(2000, 320000, rand), 2)
    const mrr = roundTo(between(200, 26000, rand), 2)
    const conversionPrecision = Math.floor(between(1, 5, rand))
    const conversionRate = roundTo(between(0.2, 34.2, rand), conversionPrecision)
    const balance = roundTo(between(50, 92000, rand), 2)
    const expense = roundTo(between(500, 210000, rand), 2)

    rows.push({
      id: i,
      username,
      avatarUrl: `https://i.pravatar.cc/64?u=${username}`,
      fullName: `${first} ${last}`,
      email: `${username}@${domain}`,
      role: pick(roles, rand),
      department: pick(departments, rand),
      country: pick(countries, rand),
      city: pick(cities, rand),
      status: pick(statuses, rand),
      plan,
      signupDate: isoDate(Math.floor(between(10, 2200, rand))),
      lastLoginAt: isoDateTime(Math.floor(between(5, 120000, rand))),
      website: `https://www.${domain}`,
      profileUrl: `https://app.${domain}/users/${username}`,
      company: pick(companies, rand),
      orders: Math.floor(between(0, 1600, rand)),
      sessions: Math.floor(between(5, 14000, rand)),
      conversionRate,
      revenue,
      balance,
      mrr,
      arr: roundTo(mrr * 12, 2),
      expense,
      score: Math.round(between(35, 99, rand)),
      ticketsOpen: Math.floor(between(0, 36, rand)),
      renewalDate: isoDate(-Math.floor(between(-10, 420, rand))),
    })
  }

  return rows
}
