import { octokit, coreTeamTriage, coreTeamTriageLogins } from 'src/lib/github'

import {
  addToProject,
  deleteFromProject,
  updateProjectItemField,
  getContentItemIdOnProject,
} from 'src/services/projects'
import { removeLabels } from 'src/services/labels'
import { addAssigneesToAssignable } from 'src/services/assign'

export function addToTriageProject(contentId: string) {
  return addToProject({ projectId: process.env.TRIAGE_PROJECT_ID, contentId })
}

export function deleteFromTriageProject(itemId: string) {
  return deleteFromProject({ projectId: process.env.TRIAGE_PROJECT_ID, itemId })
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
    projectId: process.env.TRIAGE_PROJECT_ID,
    itemId,
    fieldId,
    value,
  })
}

export function updateTriageStatusField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateTriageField({
    itemId,
    fieldId: process.env.TRIAGE_STATUS_FIELD_ID,
    value,
  })
}

export function updateTriagePriorityField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateTriageField({
    itemId,
    fieldId: process.env.TRIAGE_PRIORITY_FIELD_ID,
    value,
  })
}

export async function addToCTMDiscussionQueue(contentId: string) {
  const { addProjectNextItem } = await addToTriageProject(contentId)

  return Promise.allSettled([
    updateTriageStatusField({
      itemId: addProjectNextItem.projectNextItem.id,
      value: process.env.NEEDS_DISCUSSION_STATUS_FIELD_ID,
    }),
    updateTriagePriorityField({
      itemId: addProjectNextItem.projectNextItem.id,
      value: process.env.TP1_PRIORITY_FIELD_ID,
    }),
  ])
}

export function removeAddToCTMDiscussionQueueLabel(labelableId: string) {
  return removeLabels({
    labelableId,
    labelIds: [process.env.ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID],
  })
}

export async function addToV1TodoQueue(contentId: string) {
  const { addProjectNextItem } = await addToTriageProject(contentId)

  return Promise.allSettled([
    updateTriageStatusField({
      itemId: addProjectNextItem.projectNextItem.id,
      value: process.env.TODO_STATUS_FIELD_ID,
    }),
    updateTriagePriorityField({
      itemId: addProjectNextItem.projectNextItem.id,
      value: process.env.TP1_PRIORITY_FIELD_ID,
    }),
  ])
}

export function removeAddToV1TodoQueueLabel(labelableId: string) {
  return removeLabels({
    labelableId,
    labelIds: [process.env.ADD_TO_V1_TODO_QUEUE_LABEL_ID],
  })
}

export function getContentItemIdOnTriageProject(
  contentId: string
): Promise<string | null> {
  return getContentItemIdOnProject({
    projectId: process.env.TRIAGE_PROJECT_ID,
    contentId,
  })
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

export async function getTriageProjectItems(after?: string) {
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
      projectId: process.env.TRIAGE_PROJECT_ID,
      after,
    }
  )

  if (!node.items.pageInfo.hasNextPage) {
    return node.items.nodes
  }

  const nodes = await getTriageProjectItems(node.items.pageInfo.endCursor)

  return [...node.items.nodes, ...nodes]
}

export async function getNextCoreTeamTriageAssigneeId() {
  const triageProjectItems = await getTriageProjectItems()

  const needsTriageItems = triageProjectItems.filter(
    (triageProjectItem: ProjectNextItem) => {
      return triageProjectItem.fieldValues.nodes.some((fieldValue) => {
        if (fieldValue.projectField.name === 'Status') {
          return fieldValue.value === process.env.NEEDS_TRIAGE_STATUS_FIELD_ID
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
