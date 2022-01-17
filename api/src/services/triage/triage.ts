import { octokit, coreTeamTriage, coreTeamTriageLogins } from 'src/lib/github'

import {
  addToProject,
  deleteFromProject,
  updateProjectItemField,
} from 'src/services/projects'
import { removeLabels } from 'src/services/labels'
import { addAssigneesToAssignable } from 'src/services/assign'

const RW_TRIAGE_PROJECT_ID = 'PN_kwDOAq9qTM0dIA'

const projectId =
  process.env.NODE_ENV === 'development'
    ? process.env.DEV_TRIAGE_PROJECT_ID
    : RW_TRIAGE_PROJECT_ID

export function addToTriageProject({ contentId }: { contentId: string }) {
  return addToProject({ projectId, contentId })
}

export function deleteFromTriageProject({ itemId }: { itemId: string }) {
  return deleteFromProject({ projectId, itemId })
}

export function updateTriageField({
  fieldId,
  itemId,
  value,
}: {
  fieldId: string
  itemId: string
  value: string
}) {
  return updateProjectItemField({
    projectId,
    itemId,
    fieldId,
    value,
  })
}

const RW_TRIAGE_STATUS_FIELD_ID = 'MDE2OlByb2plY3ROZXh0RmllbGQ1NzA0OA=='

export function updateTriageStatusField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  const fieldId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_TRIAGE_STATUS_FIELD_ID
      : RW_TRIAGE_STATUS_FIELD_ID

  return updateTriageField({ itemId, fieldId, value })
}

const RW_TRIAGE_PRIORITY_FIELD_ID = 'MDE2OlByb2plY3ROZXh0RmllbGQ2NTI1NDg='

export function updateTriagePriorityField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  const fieldId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_TRIAGE_PRIORITY_FIELD_ID
      : RW_TRIAGE_PRIORITY_FIELD_ID

  return updateTriageField({ itemId, fieldId, value })
}

const RW_NEEDS_DISCUSSION_STATUS_FIELD_ID = 'a59d5422'
const RW_TP1_PRIORITY_FIELD_ID = '1196d6e9'

export async function addToCTMDiscussionQueue({
  contentId,
}: {
  contentId: string
}) {
  const { addProjectNextItem } = await addToTriageProject({ contentId })

  const statusFieldValue =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_NEEDS_DISCUSSION_STATUS_FIELD_ID
      : RW_NEEDS_DISCUSSION_STATUS_FIELD_ID

  const priorityFieldValue =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_TP1_PRIORITY_FIELD_ID
      : RW_TP1_PRIORITY_FIELD_ID

  return Promise.allSettled([
    updateTriageStatusField({
      itemId: addProjectNextItem.projectNextItem.id,
      value: statusFieldValue,
    }),
    updateTriagePriorityField({
      itemId: addProjectNextItem.projectNextItem.id,
      value: priorityFieldValue,
    }),
  ])
}

/**
 * Check if an issue's on the triage project.
 *
 * @remarks
 *
 * Right now we literally have to go through every issue on the triage project.
 * Feels like there should be a better...
 */
export async function getIssueItemIdOnTriageProject({
  issueId,
  after,
}: {
  issueId: string
  after?: string
}): Promise<string | null> {
  const { node } = await octokit.graphql<{
    node: {
      items: {
        pageInfo: {
          hasNextPage: boolean
          endCursor: string
        }
        nodes: [
          {
            id: string
            content: {
              id: string
            }
          }
        ]
      }
    }
  }>(
    `
      query isOnTriageProject($projectId: ID!, $after: String) {
        node(id: $projectId) {
          ... on ProjectNext {
            items(first: 100, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                content {
                  ... on Issue {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      projectId,
      after,
    }
  )

  const item = node.items.nodes.find((item) => {
    return item.content.id === issueId
  })

  if (item) {
    return item.id
  }

  if (node.items.pageInfo.hasNextPage) {
    return getIssueItemIdOnTriageProject({
      issueId,
      after: node.items.pageInfo.endCursor,
    })
  }

  return null
}

const RW_ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID = 'LA_kwDOC2M2f87erIoO'

export function removeAddToCTMDiscussionQueueLabel({
  labelableId,
}: {
  labelableId: string
}) {
  const labelId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID
      : RW_ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID

  return removeLabels({ labelableId, labelIds: [labelId] })
}

/**
 * Assign a core team triage member based on who has the least amount of things assigned to them.
 */
type ProjectNextItems = {
  node: {
    items: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
      nodes: [ProjectNextItem]
    }
  }
}

type ProjectNextItem = {
  fieldValues: {
    nodes: [
      {
        projectField: {
          name: string
        }
        value: string
      }
    ]
  }
  content: {
    assignees: {
      nodes: [
        {
          login: string
        }
      ]
    }
  }
}

export async function getTriageProjectItems(
  { after }: { after?: string } = { after: null }
) {
  const { node } = await octokit.graphql<ProjectNextItems>(
    `
      query projectNextItems($projectId: ID!, $after: String) {
        node(id: $projectId) {
          ... on ProjectNext {
            items(first: 100, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                fieldValues(first: 100) {
                  nodes {
                    projectField {
                      name
                    }
                    value
                  }
                }
                content {
                  ... on Issue {
                    assignees(first: 100) {
                      nodes {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      projectId,
      after,
    }
  )

  if (!node.items.pageInfo.hasNextPage) {
    return node.items.nodes
  }

  const nodes = await getTriageProjectItems({
    after: node.items.pageInfo.endCursor,
  })

  return [...node.items.nodes, ...nodes]
}

const RW_NEEDS_TRIAGE_STATUS_FIELD_ID = '4f1b8c90'

export async function getNextCoreTeamTriageAssigneeId() {
  const triageProjectItems = await getTriageProjectItems()

  const needsTriageStatusFieldId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_NEEDS_TRIAGE_STATUS_FIELD_ID
      : RW_NEEDS_TRIAGE_STATUS_FIELD_ID

  const needsTriageItems = triageProjectItems.filter(
    (triageProjectItem: ProjectNextItem) => {
      return triageProjectItem.fieldValues.nodes.some((fieldValue) => {
        if (fieldValue.projectField.name === 'Status') {
          return fieldValue.value === needsTriageStatusFieldId
        }
      })
    }
  )

  const coreTeamTriageNoAssigned = coreTeamTriageLogins.map((login) => {
    const noAssigned = needsTriageItems.reduce(
      (noAssigned: number, needsTriageItem: ProjectNextItem) => {
        const isAssigned = needsTriageItem.content.assignees?.nodes?.some(
          (assignee) => assignee.login === login
        )

        if (!isAssigned) {
          return noAssigned
        }

        return noAssigned + 1
      },
      0
    )

    return [login, noAssigned]
  })

  const [nextCoreTeamTriageAssignee] = coreTeamTriageNoAssigned.reduce(
    ([prevLogin, prevAssigned], [nextLogin, nextAssigned]) => {
      if (prevAssigned < nextAssigned) {
        return [prevLogin, prevAssigned]
      }
      return [nextLogin, nextAssigned]
    }
  )

  return coreTeamTriage[nextCoreTeamTriageAssignee].id
}

export async function assignCoreTeamTriage({
  assignableId,
}: {
  assignableId: string
}) {
  const assigneeId = await getNextCoreTeamTriageAssigneeId()

  return addAssigneesToAssignable({
    assignableId,
    assigneeIds: [assigneeId],
  })
}
