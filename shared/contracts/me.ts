import { z } from 'zod';
import { settingsSchema } from './settings';

export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  settings: settingsSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;
