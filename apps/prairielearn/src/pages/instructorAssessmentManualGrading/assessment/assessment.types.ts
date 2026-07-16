import { z } from 'zod';

import {
  RawStaffAssessmentQuestionSchema,
  RawStaffUserSchema,
} from '../../../lib/client/safe-db-types.js';

const ManualGradingUserSchema = RawStaffUserSchema.pick({
  id: true,
  name: true,
  uid: true,
});

export const ManualGradingQuestionSchema = RawStaffAssessmentQuestionSchema.extend({
  qid: z.string(),
  title: z.string(),
  number: z.string().nullable(),
  alternative_pool_number: z.number(),
  alternative_pool_size: z.coerce.number(),
  num_instance_questions: z.coerce.number(),
  num_instance_questions_to_grade: z.coerce.number(),
  num_instance_questions_assigned: z.coerce.number(),
  num_instance_questions_unassigned: z.coerce.number(),
  assigned_graders: z.array(ManualGradingUserSchema).nullable(),
  actual_graders: z.array(ManualGradingUserSchema).nullable(),
  num_open_instances: z.coerce.number(),
});
export type ManualGradingQuestion = z.infer<typeof ManualGradingQuestionSchema>;
