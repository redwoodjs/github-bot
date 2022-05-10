import * as dateFns from 'date-fns'

import { octokit } from 'src/lib/github'

export function addToMainProject(contentId: string) {
  return addToProject({ projectId: process.env.PROJECT_ID, contentId })
}

export function addToProject({
  projectId,
  contentId,
}: {
  projectId: string
  contentId: string
}) {
  return octokit.graphql<{
    addProjectNextItem: {
      projectNextItem: {
        id: string
      }
    }
  }>(ADD_TO_PROJECT_MUTATION, { projectId, contentId })
}

export const ADD_TO_PROJECT_MUTATION = `
  mutation AddProjectNextItem($projectId: ID!, $contentId: ID!) {
    addProjectNextItem(input: { projectId: $projectId, contentId: $contentId }) {
      projectNextItem {
        id
      }
    }
  }
`

// ------------------------

export function deleteFromMainProject(itemId: string) {
  return deleteFromProject({
    projectId: process.env.PROJECT_ID,
    itemId,
  })
}

export function deleteFromProject({
  projectId,
  itemId,
}: {
  projectId: string
  itemId: string
}) {
  return octokit.graphql<{
    deleteProjectNextItem: {
      deletedItemId: string
    }
  }>(DELETE_FROM_PROJECT_MUTATION, { projectId, itemId })
}

export const DELETE_FROM_PROJECT_MUTATION = `
  mutation DeleteProjectNextItem($projectId: ID!, $itemId: ID!) {
    deleteProjectNextItem(input: { projectId: $projectId, itemId: $itemId }) {
      deletedItemId
    }
  }
`

// ------------------------

export function updateMainProjectItemCycleFieldToCurrent(itemId: string) {
  return updateMainProjectItemCycleField({
    itemId,
    value: process.env.CURRENT_CYCLE_FIELD_ID,
  })
}

export function updateMainProjectItemCycleField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateMainProjectItemField({
    itemId,
    fieldId: process.env.CYCLE_FIELD_ID,
    value,
  })
}

// ------------------------

export function updateMainProjectItemStatusFieldToTriage(itemId: string) {
  return updateMainProjectItemStatusField({
    itemId,
    value: process.env.TRIAGE_STATUS_FIELD_ID,
  })
}

export function updateMainProjectItemStatusFieldToBacklog(itemId: string) {
  return updateMainProjectItemStatusField({
    itemId,
    value: process.env.BACKLOG_STATUS_FIELD_ID,
  })
}

export function updateMainProjectItemStatusFieldToTodo(itemId: string) {
  return updateMainProjectItemStatusField({
    itemId,
    value: process.env.TODO_STATUS_FIELD_ID,
  })
}

export function updateMainProjectItemStatusFieldToInProgress(itemId: string) {
  return updateMainProjectItemStatusField({
    itemId,
    value: process.env.IN_PROGRESS_STATUS_FIELD_ID,
  })
}

export function updateMainProjectItemStatusFieldToDone(itemId: string) {
  return updateMainProjectItemStatusField({
    itemId,
    value: process.env.DONE_STATUS_FIELD_ID,
  })
}

export function updateMainProjectItemStatusFieldToArchived(itemId: string) {
  return updateMainProjectItemStatusField({
    itemId,
    value: process.env.ARCHIVED_STATUS_FIELD_ID,
  })
}

export function updateMainProjectItemStatusField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateMainProjectItemField({
    itemId,
    fieldId: process.env.STATUS_FIELD_ID,
    value,
  })
}

export function updateMainProjectItemField({
  itemId,
  fieldId,
  value,
}: {
  itemId: string
  fieldId: string
  value: string
}) {
  return updateProjectItemField({
    projectId: process.env.PROJECT_ID,
    itemId,
    fieldId,
    value,
  })
}

export function updateProjectItemField({
  projectId,
  itemId,
  fieldId,
  value,
}: {
  projectId: string
  itemId: string
  fieldId: string
  value: string
}) {
  return octokit.graphql<{
    updateProjectNextItemField: {
      projectNextItem: {
        id: string
      }
    }
  }>(UPDATE_PROJECT_ITEM_FIELD_MUTATION, {
    projectId,
    itemId,
    fieldId,
    value,
  })
}

export const UPDATE_PROJECT_ITEM_FIELD_MUTATION = `
  mutation UpdateProjectNextItemField(
    $projectId: ID!
    $itemId: ID!
    $fieldId: ID!
    $value: String!
  ) {
    updateProjectNextItemField(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: $value
      }
    ) {
      projectNextItem {
        id
      }
    }
  }
`

// ------------------------

export function getContentItemIdOnMainProject(
  contentId: string
): Promise<string | null> {
  return getContentItemIdOnProject({
    projectId: process.env.PROJECT_ID,
    contentId,
  })
}

export async function getContentItemIdOnProject({
  projectId,
  contentId,
  after,
}: {
  projectId: string
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
      query GetContentItemIdOnProject($projectId: ID!, $after: String) {
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
      projectId,
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
    return getContentItemIdOnProject({
      projectId,
      contentId,
      after: node.items.pageInfo.endCursor,
    })
  }

  return null
}

// ------------------------

export async function getMainProjectBacklogItems() {
  const mainProjectItems = await getMainProjectItems()

  return mainProjectItems.filter((item) => {
    const statusField = getField(item, 'Status')
    return statusField?.value === process.env.BACKLOG_STATUS_FIELD_ID
  })
}

export async function getMainProjectDoneItems() {
  const mainProjectItems = await getMainProjectItems()

  return mainProjectItems.filter((item) => {
    const statusField = getField(item, 'Status')
    return statusField?.value === process.env.DONE_STATUS_FIELD_ID
  })
}

export function getField(
  projectNextItem,
  field: 'Status' | 'Cycle' | 'Priority'
) {
  return projectNextItem.fieldValues.nodes.find(
    (fieldValue) => fieldValue.projectField.name === field
  )
}

export function getMainProjectItems() {
  return getProjectItems({ projectId: process.env.PROJECT_ID })
}

export async function getProjectItems({
  projectId,
  after,
}: {
  projectId: string
  after?: string
}) {
  const { node } = await octokit.graphql<{
    node: {
      items: {
        pageInfo: {
          hasNextPage: boolean
          endCursor: string
        }
        nodes: Array<{
          id: string
        }>
      }
    }
  }>(GET_PROJECT_ITEMS, {
    projectId,
    after,
  })

  if (!node.items.pageInfo.hasNextPage) {
    return node.items.nodes
  }

  const nextItems = await getProjectItems({
    projectId,
    after: node.items.pageInfo.endCursor,
  })

  return [...node.items.nodes, ...nextItems]
}

const GET_PROJECT_ITEMS = `
  query GetProjectItems($projectId: ID!, $after: String) {
    node(id: $projectId) {
      ... on ProjectNext {
        items(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            content {
              ...on UniformResourceLocatable {
                url
              }
            }
            fieldValues(first: 10) {
              nodes {
                id
                projectField {
                  settings
                  name
                }
                value
              }
            }
          }
        }
      }
    }
  }
`

// ------------------------

// const DATE_FORMAT = 'yyyy-MM-dd'

// const START_OF_FIRST_CYCLE = new Date('2022-04-18')

// let startOfNearestCycle
// let start = START_OF_FIRST_CYCLE
// const now = new Date()

// while (!startOfNearestCycle) {
//   const end = dateFns.addWeeks(start, 2)

//   if (dateFns.isWithinInterval(now, { start, end })) {
//     startOfNearestCycle = dateFns.format(start, DATE_FORMAT)
//   } else {
//     start = end
//   }
// }

// let query: string[] | string = [
//   'repo:redwoodjs/redwood',
//   '-author:app/renovate',
//   'sort:created-asc',
//   `updated:>=${startOfNearestCycle}`,
// ]

// if (args['is-closed']) {
//   ;(query as string[]).push('is:closed')
// }

// query = args.query ? args.query : (query as string[]).join(' ')

// execSync(
//   `open https://github.com/redwoodjs/redwood/issues?q=${encodeURIComponent(
//     query
//   )}`
// )
