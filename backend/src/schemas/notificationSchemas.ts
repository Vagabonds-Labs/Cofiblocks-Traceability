import { z } from 'zod';

/**
 * Create notification schema
 */
export const createNotificationSchema = z.object({
  body: z.object({
    receiverId: z.string().uuid('Invalid receiver ID format'),
    key: z.string().min(1, 'Key is required'),
    arguments: z.array(z.string()).default([]),
    level: z.enum(['WARNING', 'INFO', 'ERROR'], {
      message: 'Level must be WARNING, INFO, or ERROR',
    }),
  }),
});

/**
 * Get notifications schema (query params for pagination and language)
 */
export const getNotificationsSchema = z.object({
  query: z
    .object({
      limit: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 20))
        .refine(Number.isInteger)
        .refine((val) => val >= 1 && val <= 100),

      offset: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 0))
        .refine(Number.isInteger)
        .refine((val) => val >= 0),

      lang: z.enum(['en', 'es']).optional().default('en'),
    })
    .default({ limit: 20, offset: 0, lang: 'en' }),
});



/**
 * Update notifications schema
 * Accepts a list of notification IDs to mark as read
 */
export const updateNotificationsSchema = z.object({
  body: z.object({
    notificationIds: z
      .array(z.string().uuid('Invalid notification ID format'))
      .min(1, 'At least one notification ID is required'),
  }),
});

// Type inference from schemas
export type CreateNotificationRequest = z.infer<typeof createNotificationSchema>['body'];
export type GetNotificationsQuery = z.infer<typeof getNotificationsSchema>['query'];
export type UpdateNotificationsRequest = z.infer<typeof updateNotificationsSchema>['body'];

