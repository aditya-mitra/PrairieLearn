import {
  type ColumnPinningState,
  type ColumnSizingState,
  type FilterFn,
  type Header,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsString, useQueryState } from 'nuqs';
import { type ReactNode, useMemo, useState } from 'react';

import {
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  NuqsAdapter,
  TanstackTableCard,
  TanstackTableEmptyState,
  applyMultiSelectFilter,
  extractLeafColumnIds,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsSortingState,
  useColumnFilters,
} from '@prairielearn/ui';

import { idsEqual } from '../../../lib/id.js';

import type { ManualGradingQuestion } from './assessment.types.js';

const columnHelper = createColumnHelper<ManualGradingQuestion>();

const GRADING_STATUS_VALUES = ['Needs grading', 'Fully graded', 'No submissions'] as const;
type GradingStatus = (typeof GRADING_STATUS_VALUES)[number];

const UNASSIGNED_FILTER_VALUE = 'unassigned';
const NOT_GRADED_FILTER_VALUE = 'not-graded';
const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: ['question'], right: [] };
const DEFAULT_MULTI_SELECT_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };

function graderFilterValue(id: string) {
  return `user:${id}`;
}

function displayedGraderName(grader: { name: string | null; uid: string }) {
  return grader.name ?? grader.uid;
}

function getQuestionNumber(question: ManualGradingQuestion) {
  return `${question.alternative_pool_number}.${
    question.alternative_pool_size === 1 ? '' : `${question.number_in_alternative_group}.`
  }`;
}

function getGradingStatus(question: ManualGradingQuestion): GradingStatus {
  if (question.num_instance_questions === 0) return 'No submissions';
  if (question.num_instance_questions_to_grade > 0) return 'Needs grading';
  return 'Fully graded';
}

function getAutoPoints(question: ManualGradingQuestion, assessmentType: string) {
  if (!question.max_auto_points) return '—';
  if (assessmentType === 'Exam') {
    return (question.points_list || [question.max_manual_points ?? 0])
      .map((points) => points - (question.max_manual_points ?? 0))
      .join(',');
  }
  return String((question.init_points ?? 0) - (question.max_manual_points ?? 0));
}

function ProgressBar({ partial, total }: { partial: number; total: number }) {
  if (total <= 0) return null;
  const progress = Math.floor(100 * (1 - partial / total));
  return (
    <div className="progress border flex-grow-1" style={{ minWidth: '4em', maxWidth: '10em' }}>
      <div className="progress-bar bg-light" style={{ width: `${progress}%` }} />
      <div className="progress-bar bg-danger" style={{ width: `${100 - progress}%` }} />
    </div>
  );
}

function AdminButtons({ csrfToken }: { csrfToken: string }) {
  return (
    <>
      <form method="POST" className="d-inline">
        <input type="hidden" name="__action" value="export_ai_grading_statistics" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <button type="submit" className="btn btn-sm btn-light grading-tag-button">
          <i className="bi bi-download" aria-hidden="true" /> Export AI grading statistics
        </button>
      </form>
      <form method="POST" className="d-inline">
        <input type="hidden" name="__action" value="ai_grade_all" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <button type="submit" className="btn btn-sm btn-light grading-tag-button">
          <i className="bi bi-stars" aria-hidden="true" /> AI grade all questions
        </button>
      </form>
      <form method="POST" className="d-inline">
        <input type="hidden" name="__action" value="delete_ai_grading_data" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <button
          type="submit"
          className="btn btn-sm btn-light grading-tag-button"
          data-bs-toggle="tooltip"
          data-bs-title="Delete all AI grading results for this assessment's questions"
        >
          Delete AI grading data
        </button>
      </form>
    </>
  );
}

const globalFilterFn: FilterFn<ManualGradingQuestion> = (row, _columnId, value) => {
  const search = String(value).toLowerCase();
  if (!search) return true;
  const question = row.original;
  return [getQuestionNumber(question), question.title, question.qid].some((field) =>
    field.toLowerCase().includes(search),
  );
};

function ManualGradingAssessmentTableInner({
  questions,
  assessmentId,
  assessmentType,
  title,
  urlPrefix,
  canEdit,
  currentUserId,
  currentUserName,
  csrfToken,
  adminFeaturesEnabled,
}: Omit<ManualGradingAssessmentTableProps, 'search'>) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const { graderLabels, assignedGraderValues, actualGraderValues } = useMemo(() => {
    const labels = new Map<string, string>();
    const assignedValues = new Set<string>();
    const actualValues = new Set<string>();
    for (const question of questions) {
      for (const grader of question.assigned_graders ?? []) {
        const value = graderFilterValue(grader.id);
        labels.set(value, grader.name ? `${grader.name} (${grader.uid})` : grader.uid);
        assignedValues.add(value);
      }
      for (const grader of question.actual_graders ?? []) {
        const value = graderFilterValue(grader.id);
        labels.set(value, grader.name ? `${grader.name} (${grader.uid})` : grader.uid);
        actualValues.add(value);
      }
    }
    return {
      graderLabels: labels,
      assignedGraderValues: [...assignedValues].sort((a, b) =>
        labels.get(a)!.localeCompare(labels.get(b)!),
      ),
      actualGraderValues: [...actualValues].sort((a, b) =>
        labels.get(a)!.localeCompare(labels.get(b)!),
      ),
    };
  }, [questions]);

  const filterRegistry = useMemo(
    () => ({
      submissions: {
        urlKey: 'status',
        parser: parseAsMultiSelectFilter(GRADING_STATUS_VALUES),
        defaultValue: DEFAULT_MULTI_SELECT_FILTER,
      },
      assigned_graders: {
        urlKey: 'assigned_grader',
        parser: parseAsMultiSelectFilter(),
        defaultValue: DEFAULT_MULTI_SELECT_FILTER,
      },
      actual_graders: {
        urlKey: 'graded_by',
        parser: parseAsMultiSelectFilter(),
        defaultValue: DEFAULT_MULTI_SELECT_FILTER,
      },
    }),
    [],
  );
  const { columnFilters, onColumnFiltersChange, onResetColumnFilters } =
    useColumnFilters(filterRegistry);

  const columns = useMemo(
    () => [
      columnHelper.accessor((question) => `${getQuestionNumber(question)} ${question.title}`, {
        id: 'question',
        header: 'Question',
        enableHiding: false,
        cell: ({ row }) => {
          const question = row.original;
          const gradingUrl = `${urlPrefix}/assessment/${assessmentId}/manual_grading/assessment_question/${question.id}`;
          return (
            <div className="text-truncate">
              <a href={gradingUrl}>
                {getQuestionNumber(question)} {question.title}
              </a>
              {question.manual_rubric_id != null && (
                <span
                  className="ms-2 text-info"
                  data-bs-toggle="tooltip"
                  data-bs-title="This question uses a rubric"
                >
                  <i className="fas fa-list-check" aria-hidden="true" />
                </span>
              )}
            </div>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original;
          const b = rowB.original;
          return (
            a.alternative_pool_number - b.alternative_pool_number ||
            (a.number_in_alternative_group ?? 0) - (b.number_in_alternative_group ?? 0) ||
            a.title.localeCompare(b.title)
          );
        },
        size: 280,
      }),
      columnHelper.accessor('qid', {
        id: 'qid',
        header: 'QID',
        size: 180,
      }),
      columnHelper.accessor((question) => question.max_auto_points ?? 0, {
        id: 'auto_points',
        header: 'Auto points',
        cell: ({ row }) => getAutoPoints(row.original, assessmentType),
        size: 110,
      }),
      columnHelper.accessor((question) => question.max_manual_points ?? 0, {
        id: 'manual_points',
        header: 'Manual points',
        cell: (info) => info.getValue() || '—',
        size: 120,
      }),
      columnHelper.accessor('num_instance_questions_to_grade', {
        id: 'submissions',
        header: 'Submissions to grade',
        meta: { label: 'Submissions to grade' },
        cell: ({ row }) => {
          const question = row.original;
          return (
            <div className="d-flex align-items-center gap-2">
              <span className="text-nowrap" data-testid="iq-to-grade-count">
                {question.num_instance_questions_to_grade} / {question.num_instance_questions}
              </span>
              <ProgressBar
                partial={question.num_instance_questions_to_grade}
                total={question.num_instance_questions}
              />
            </div>
          );
        },
        sortingFn: (rowA, rowB) =>
          rowA.original.num_instance_questions_to_grade -
            rowB.original.num_instance_questions_to_grade ||
          rowA.original.num_instance_questions - rowB.original.num_instance_questions,
        filterFn: (row, _columnId, filter: MultiSelectFilterValue<GradingStatus>) =>
          applyMultiSelectFilter(filter, (values) =>
            values.includes(getGradingStatus(row.original)),
          ),
        size: 210,
      }),
      columnHelper.accessor(
        (question) => (question.assigned_graders ?? []).map(displayedGraderName).sort().join(', '),
        {
          id: 'assigned_graders',
          header: 'Grading assigned to',
          meta: { label: 'Grading assigned to', wrapText: true },
          cell: ({ row }) => {
            const question = row.original;
            const assignedGraders = [...(question.assigned_graders ?? [])].sort((a, b) =>
              displayedGraderName(a).localeCompare(displayedGraderName(b)),
            );
            return (
              <div>
                {assignedGraders.map((grader, index) => (
                  <span key={grader.id}>
                    {index > 0 && ', '}
                    {idsEqual(grader.id, currentUserId) &&
                    question.num_instance_questions_assigned > 0 ? (
                      <strong className="bg-warning rounded px-1">{currentUserName}</strong>
                    ) : (
                      displayedGraderName(grader)
                    )}
                  </span>
                ))}
                {question.num_instance_questions_unassigned > 0 && (
                  <>
                    {assignedGraders.length > 0 && ' '}
                    <small className="text-muted">
                      ({question.num_instance_questions_unassigned} unassigned)
                    </small>
                    {canEdit && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        data-bs-toggle="modal"
                        data-bs-target="#grader-assignment-modal"
                        data-assessment-question-id={question.id}
                        aria-label="Assign to graders"
                      >
                        <i className="fas fa-pencil" aria-hidden="true" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          },
          filterFn: (row, _columnId, filter: MultiSelectFilterValue) =>
            applyMultiSelectFilter(filter, (values) => {
              const assignedValues = new Set(
                (row.original.assigned_graders ?? []).map((grader) => graderFilterValue(grader.id)),
              );
              return values.some(
                (value) =>
                  assignedValues.has(value) ||
                  (value === UNASSIGNED_FILTER_VALUE &&
                    row.original.num_instance_questions_unassigned > 0),
              );
            }),
          size: 240,
        },
      ),
      columnHelper.accessor(
        (question) => (question.actual_graders ?? []).map(displayedGraderName).sort().join(', '),
        {
          id: 'actual_graders',
          header: 'Graded by',
          meta: { label: 'Graded by', wrapText: true },
          cell: (info) => info.getValue(),
          filterFn: (row, _columnId, filter: MultiSelectFilterValue) =>
            applyMultiSelectFilter(filter, (values) => {
              const actualValues = new Set(
                (row.original.actual_graders ?? []).map((grader) => graderFilterValue(grader.id)),
              );
              return values.some(
                (value) =>
                  actualValues.has(value) ||
                  (value === NOT_GRADED_FILTER_VALUE &&
                    row.original.num_instance_questions > 0 &&
                    actualValues.size === 0),
              );
            }),
          size: 200,
        },
      ),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => {
          const question = row.original;
          const showGradingButton =
            canEdit &&
            question.num_instance_questions_assigned + question.num_instance_questions_unassigned >
              0;
          if (!showGradingButton) return null;
          const gradingUrl = `${urlPrefix}/assessment/${assessmentId}/manual_grading/assessment_question/${question.id}`;
          return (
            <a className="btn btn-xs btn-primary text-nowrap" href={`${gradingUrl}/next_ungraded`}>
              Grade next submission
            </a>
          );
        },
        size: 175,
      }),
    ],
    [assessmentId, assessmentType, canEdit, currentUserId, currentUserName, urlPrefix],
  );

  const allColumnIds = useMemo(() => extractLeafColumnIds(columns), [columns]);
  const defaultColumnVisibility = useMemo(
    () => Object.fromEntries(allColumnIds.map((id) => [id, true])),
    [allColumnIds],
  );
  const columnVisibilityParser = useMemo(
    () =>
      parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
    [allColumnIds, defaultColumnVisibility],
  );
  const [columnVisibility, setColumnVisibility] = useQueryState('columns', columnVisibilityParser);

  const filters = useMemo(() => {
    const renderGraderValue = ({ value }: { value: string }) => (
      <span className="text-nowrap">{graderLabels.get(value) ?? value}</span>
    );
    return {
      submissions: ({ header }: { header: Header<ManualGradingQuestion, unknown> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={GRADING_STATUS_VALUES}
          showModeToggle={false}
        />
      ),
      assigned_graders: ({ header }: { header: Header<ManualGradingQuestion, unknown> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={[...assignedGraderValues, UNASSIGNED_FILTER_VALUE]}
          renderValueLabel={({ value }) =>
            value === UNASSIGNED_FILTER_VALUE ? (
              <span className="text-nowrap">Unassigned</span>
            ) : (
              renderGraderValue({ value })
            )
          }
        />
      ),
      actual_graders: ({ header }: { header: Header<ManualGradingQuestion, unknown> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={[...actualGraderValues, NOT_GRADED_FILTER_VALUE]}
          renderValueLabel={({ value }) =>
            value === NOT_GRADED_FILTER_VALUE ? (
              <span className="text-nowrap">Not graded by anyone</span>
            ) : (
              renderGraderValue({ value })
            )
          }
        />
      ),
    } satisfies Record<
      string,
      (props: { header: Header<ManualGradingQuestion, unknown> }) => ReactNode
    >;
  }, [actualGraderValues, assignedGraderValues, graderLabels]);

  const table = useReactTable({
    data: questions,
    columns,
    columnResizeMode: 'onChange',
    globalFilterFn,
    getRowId: (question) => question.id,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnSizing,
      columnVisibility,
      columnPinning,
    },
    initialState: {
      columnPinning: DEFAULT_PINNING,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 80,
      size: 150,
      maxSize: 500,
      enableSorting: true,
      enableHiding: true,
      enablePinning: true,
    },
  });

  return (
    <TanstackTableCard
      table={table}
      title={title}
      style={{ height: '80vh', minHeight: 500 }}
      singularLabel="question"
      pluralLabel="questions"
      headerButtons={
        adminFeaturesEnabled && questions.length > 0 ? <AdminButtons csrfToken={csrfToken} /> : null
      }
      globalFilter={{ placeholder: 'Search by question number, title, or QID...' }}
      tableOptions={{
        filters,
        rowHeight: 52,
        emptyState: (
          <TanstackTableEmptyState iconName="bi-list-check">
            No questions are available for manual grading.
          </TanstackTableEmptyState>
        ),
        noResultsState: (
          <TanstackTableEmptyState iconName="bi-search">
            No questions found matching your search criteria.
          </TanstackTableEmptyState>
        ),
      }}
      onResetColumnFilters={onResetColumnFilters}
    />
  );
}

interface ManualGradingAssessmentTableProps {
  questions: ManualGradingQuestion[];
  assessmentId: string;
  assessmentType: string;
  title: string;
  urlPrefix: string;
  canEdit: boolean;
  currentUserId: string;
  currentUserName: string;
  csrfToken: string;
  adminFeaturesEnabled: boolean;
  search: string;
}

export function ManualGradingAssessmentTable({
  search,
  ...props
}: ManualGradingAssessmentTableProps) {
  return (
    <NuqsAdapter search={search}>
      <ManualGradingAssessmentTableInner {...props} />
    </NuqsAdapter>
  );
}

ManualGradingAssessmentTable.displayName = 'ManualGradingAssessmentTable';
