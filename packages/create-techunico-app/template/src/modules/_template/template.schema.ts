import { z } from 'zod'

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>