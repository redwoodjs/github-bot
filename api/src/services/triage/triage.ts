import { octokit, coreTeamTriage, coreTeamTriageLogins } from 'src/lib/github'

import {
  addToProject,
  deleteFromProject,
  updateProjectItemField,
} from 'src/services/projects'
import { removeLabels } from 'src/services/labels'
import { addAssigneesToAssignable } from 'src/services/assign'

export function addToTriageProject({ contentId }: { contentId: string }) {
  return addToProject({ projectId: process.env.TRIAGE_PROJECT_ID, contentId })
}

export function deleteFromTriageProject({ itemId }: { itemId: string }) {
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

export async function addToCTMDiscussionQueue({
  contentId,
}: {
  contentId: string
}) {
  const { addProjectNextItem } = await addToTriageProject({ contentId })

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

/**
 * Check if an issue's on the triage project.
 *
 * @remarks
 *
 * Right now we literally have to go through every issue on the triage project.
 * Feels like there should be a better...
 */
export async function getContentItemIdOnTriageProject({
  contentId,
  after,
}: {
  contentId: string
  after?: string
}): Promise<string | null> {
  const { node } = await octokit.graphql<{
    node: {
      items: {
        pageInfo: {
          hasNextPage: boolean
          endCursor: string
        }
        nodes: Array<{
          id: string
          content: {
            id: string
          }
        }>
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
                  ... on PullRequest {
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
      projectId: process.env.TRIAGE_PROJECT_ID,
      after,
    }
  )

  const item = node.items.nodes.find((item) => {
    return item.content.id === contentId
  })

  if (item) {
    return item.id
  }

  if (node.items.pageInfo.hasNextPage) {
    return getContentItemIdOnTriageProject({
      contentId,
      after: node.items.pageInfo.endCursor,
    })
  }

  return null
}

export function removeAddToCTMDiscussionQueueLabel({
  labelableId,
}: {
  labelableId: string
}) {
  return removeLabels({
    labelableId,
    labelIds: [process.env.ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID],
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
      projectId: process.env.TRIAGE_PROJECT_ID,
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
