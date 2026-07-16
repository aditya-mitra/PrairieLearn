import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';
import { Hydrate } from '@prairielearn/react/server';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { Modal } from '../../../components/Modal.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import type { User } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import { ManualGradingAssessmentTable } from './ManualGradingAssessmentTable.js';
import type { ManualGradingQuestion } from './assessment.types.js';

export function ManualGradingAssessment({
  resLocals,
  questions,
  courseStaff,
  num_open_instances,
  adminFeaturesEnabled,
  search,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  questions: ManualGradingQuestion[];
  courseStaff: User[];
  num_open_instances: number;
  adminFeaturesEnabled: boolean;
  search: string;
}) {
  const currentUserName = resLocals.authz_data.user.name ?? resLocals.authz_data.user.uid;
  return PageLayout({
    resLocals,
    pageTitle: 'Manual Grading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
      ${compiledScriptTag('instructorAssessmentManualGradingAssessmentClient.ts')}
    `,
    preContent: html`
      ${resLocals.authz_data.has_course_instance_permission_edit
        ? GraderAssignmentModal({ courseStaff, csrfToken: resLocals.__csrf_token })
        : ''}
    `,
    content: (
      <>
        <AssessmentOpenInstancesAlert
          numOpenInstances={num_open_instances}
          assessmentId={resLocals.assessment.id}
          urlPrefix={resLocals.urlPrefix}
        />
        <Hydrate>
          <ManualGradingAssessmentTable
            questions={questions}
            assessmentId={resLocals.assessment.id}
            assessmentType={resLocals.assessment.type}
            title={`${resLocals.assessment_set.name} ${resLocals.assessment.number}: Manual Grading Queue`}
            urlPrefix={resLocals.urlPrefix}
            canEdit={resLocals.authz_data.has_course_instance_permission_edit}
            currentUserId={resLocals.authz_data.user.id}
            currentUserName={currentUserName}
            csrfToken={resLocals.__csrf_token}
            adminFeaturesEnabled={adminFeaturesEnabled}
            search={search}
          />
        </Hydrate>
      </>
    ),
  });
}

function GraderAssignmentModal({
  csrfToken,
  courseStaff,
}: {
  csrfToken: string;
  courseStaff: User[];
}) {
  return Modal({
    id: 'grader-assignment-modal',
    title: 'Assign instances to graders',
    body: renderHtml(
      courseStaff.length > 0 ? (
        <>
          <p>Assign instances to the following graders:</p>
          {courseStaff.map((staff) => (
            <div key={staff.id} className="form-check">
              <input
                type="checkbox"
                id={`grader-assignment-${staff.id}`}
                name="assigned_grader"
                value={staff.id}
                className="form-check-input"
              />
              <label className="form-check-label" htmlFor={`grader-assignment-${staff.id}`}>
                {staff.name ? `${staff.name} (${staff.uid})` : staff.uid}
              </label>
            </div>
          ))}
          <div className="mt-3 mb-0 small alert alert-info">
            Only instances that require grading and are not yet assigned to a grader will be
            affected. If more than one grader is selected, the instances will be randomly split
            between the graders.
          </div>
        </>
      ) : (
        <p>
          There are currently no staff members with Editor permission assigned to this course
          instance.
        </p>
      ),
    ),
    footer: renderHtml(
      <>
        <input type="hidden" name="unsafe_assessment_question_id" value="" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="__action" value="assign_graders" />
        <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={courseStaff.length === 0}>
          Assign
        </button>
      </>,
    ),
  });
}
