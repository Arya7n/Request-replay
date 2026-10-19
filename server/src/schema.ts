import { z } from 'zod';

const headerSchema = z.object({
  name: z.string().max(200),
  value: z.string().max(4_000),
});

export const snapshotSchema = z.object({
  label: z.string().max(300),
  status: z.number().int().min(0).max(599).nullable(),
  headers: z.array(headerSchema).max(80),
  body: z.string().max(100_000).nullable(),
});

export const compareRequestSchema = z.object({
  left: snapshotSchema,
  right: snapshotSchema,
});
