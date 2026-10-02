import { describe, expect, it } from 'vitest'
import { loginSchema, planSchema, registerSchema, soilTestSchema } from './schemas'

const validRegister = { full_name: 'Test Farmer', email: 'farmer@example.test', password: 'paddyfield42', confirm: 'paddyfield42', accept: true as const }

describe('auth validation', () => {
  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true)
  })
  it('rejects short or letter-only passwords', () => {
    const r1 = registerSchema.safeParse({ ...validRegister, password: 'short1', confirm: 'short1' })
    expect(r1.success).toBe(false)
    const r2 = registerSchema.safeParse({ ...validRegister, password: 'onlyletterspass', confirm: 'onlyletterspass' })
    expect(r2.error?.issues[0].message).toBe('validation.passwordMix')
  })
  it('requires matching passwords and acceptance', () => {
    const r = registerSchema.safeParse({ ...validRegister, confirm: 'different42x' })
    expect(r.error?.issues.find((i) => i.path[0] === 'confirm')?.message).toBe('validation.passwordMatch')
    expect(registerSchema.safeParse({ ...validRegister, accept: false }).success).toBe(false)
  })
  it('validates login email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).error?.issues[0].message).toBe('validation.email')
  })
})

describe('plan and soil validation', () => {
  const plan = {
    land_id: 'l1', crop_slug: 'paddy', method: 'transplanting' as const, anchor_type: 'transplanting' as const,
    anchor_date: '2026-08-20', irrigation_method: 'flood' as const, water_availability: 'assured' as const,
  }
  it('requires a transplanting anchor for transplanted crops', () => {
    expect(planSchema.safeParse(plan).success).toBe(true)
    expect(planSchema.safeParse({ ...plan, anchor_type: 'sowing' }).success).toBe(false)
  })
  it('requires a sowing anchor for direct-seeded crops', () => {
    expect(planSchema.safeParse({ ...plan, method: 'direct_seeding_wet', anchor_type: 'transplanting' }).success).toBe(false)
    expect(planSchema.safeParse({ ...plan, method: 'direct_seeding_wet', anchor_type: 'sowing' }).success).toBe(true)
  })
  it('requires nursery sowing before transplanting', () => {
    expect(planSchema.safeParse({ ...plan, nursery_sowing_date: '2026-09-01' }).success).toBe(false)
    expect(planSchema.safeParse({ ...plan, nursery_sowing_date: '2026-08-20' }).success).toBe(false)
    expect(planSchema.safeParse({ ...plan, nursery_sowing_date: '2026-07-28' }).success).toBe(true)
  })
  it('turns blank soil-test numbers into null and range-checks pH', () => {
    const ok = soilTestSchema.parse({ sample_date: '2026-06-01', ph: '6.8', ec_ds_m: '' })
    expect(ok.ph).toBe(6.8)
    expect(ok.ec_ds_m).toBeNull()
    expect(soilTestSchema.safeParse({ sample_date: '2026-06-01', ph: '14' }).success).toBe(false)
  })
})
