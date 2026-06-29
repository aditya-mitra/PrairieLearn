import type { GradingJobStatus } from '../models/grading-job.js';

export interface StatusMessageSubmission {
  id: string;
  grading_job_id: string | null | undefined;
  grading_job_status: GradingJobStatus;
  /**
   * Optional free-form status detail for a job that is currently `grading`,
   * e.g. `Pulling image (42%)`. Only emitted by the local (development)
   * external grader; `null`/absent means the default status label is shown.
   */
  message?: string | null;
}

export interface StatusMessage {
  variant_id: string;
  submissions: StatusMessageSubmission[];
}
