import { z } from 'zod'

// Error messages are i18n keys; forms translate them at render time.
export const loginSchema = z.object({
  email: z.email('validation.email'),
  password: z.string().min(1, 'validation.required'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const passwordSchema = z
  .string()
  .min(10, 'validation.passwordMin')
  .max(128, 'validation.passwordMax')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'validation.passwordMix')

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'validation.nameMin').max(120),
    email: z.email('validation.email'),
    password: passwordSchema,
    confirm: z.string(),
    accept: z.literal(true, { error: 'validation.accept' }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMatch' })
export type RegisterInput = z.input<typeof registerSchema>

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMatch' })

export const forgotSchema = z.object({ email: z.email('validation.email') })

const optionalNumber = (min: number, max: number) =>
  z
    .union([z.literal(''), z.coerce.number().min(min, 'validation.range').max(max, 'validation.range')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v))

export const soilTestSchema = z.object({
  sample_date: z.string().min(1, 'validation.required'),
  lab_name: z.string().optional().transform((v) => v || null),
  ph: optionalNumber(3, 10),
  ec_ds_m: optionalNumber(0, 20),
  organic_carbon_pct: optionalNumber(0, 10),
  n_kg_ha: optionalNumber(0, 2000),
  p_kg_ha: optionalNumber(0, 1000),
  k_kg_ha: optionalNumber(0, 3000),
  texture: z.string().optional().transform((v) => v || null),
  notes: z.string().optional().transform((v) => v || null),
})

const planFields = {
  land_id: z.string().min(1, 'validation.required'),
  crop_slug: z.string().min(1, 'validation.required'),
  variety_id: z.string().optional(),
  method: z.enum(['transplanting', 'direct_seeding_wet', 'direct_seeding_dry', 'sowing']),
  anchor_type: z.enum(['sowing', 'transplanting']),
  anchor_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date'),
  nursery_sowing_date: z.string().optional(),
  irrigation_method: z.enum(['flood', 'awd', 'drip', 'sprinkler', 'rainfed']),
  water_availability: z.enum(['assured', 'limited', 'rainfed']),
  planting_density: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
}

type PlanRules = { method: string; anchor_type: string; anchor_date: string; nursery_sowing_date?: string }
function withPlanRules<S extends z.ZodType<PlanRules>>(schema: S) {
  return schema
    .refine((v) => v.method !== 'transplanting' || v.anchor_type === 'transplanting', {
      path: ['anchor_type'],
      message: 'validation.transplantAnchor',
    })
    .refine((v) => v.method === 'transplanting' || v.anchor_type === 'sowing', {
      path: ['anchor_type'],
      message: 'validation.sowingAnchor',
    })
    .refine((v) => !v.nursery_sowing_date || v.nursery_sowing_date < v.anchor_date, {
      path: ['nursery_sowing_date'],
      message: 'validation.nurseryBefore',
    })
}

export const planSchema = withPlanRules(z.object(planFields))
export type PlanInput = z.infer<typeof planSchema>

/** Editing keeps the field and crop fixed (changing those means a new plan). */
const { land_id: _land, crop_slug: _crop, ...editFields } = planFields
export const planEditSchema = withPlanRules(z.object(editFields))
export type PlanEditInput = z.infer<typeof planEditSchema>
