import { octokit } from 'src/lib/github'

/**
 * Add an issue or PR to the project.
 */

export const projectTitle = 'Main'

export let projectId

export async function getProjectId() {
  if (projectId) {
    return projectId
  }

  const {
    organization: {
      projectsNext: { nodes },
    },
  } = await octokit.graphql<GetProjectIdQueryRes>(getProjectIdQuery, {
    login: process.env.OWNER,
  })

  ;({ id: projectId } = nodes.find(
    (projectNext) => projectNext.title === projectTitle
  ))

  return projectId
}

export const getProjectIdQuery = `
  query GetProjectIdQuery($login: String!) {
    organization(login: $login) {
      projectsNext(first: 100) {
        nodes {
          title
          id
        }
      }
    }
  }
`

export type GetProjectIdQueryRes = {
  organization: {
    projectsNext: { nodes: Array<{ title: string; id: string }> }
  }
}

export async function addToProject(contentId: string) {
  if (!projectId) {
    await getProjectId()
  }

  const {
    addProjectNextItem: {
      projectNextItem: { id },
    },
  } = await octokit.graphql<AddProjectNextItemMutationRes>(
    addProjectNextItemMutation,
    {
      projectId,
      contentId,
    }
  )

  return id
}

export const addProjectNextItemMutation = `
  mutation AddProjectNextItemMutation($projectId: ID!, $contentId: ID!) {
    addProjectNextItem(input: { projectId: $projectId, contentId: $contentId }) {
      projectNextItem {
        id
      }
    }
  }
`

export type AddProjectNextItemMutationRes = {
  addProjectNextItem: {
    projectNextItem: {
      id: string
    }
  }
}

/**
 * Delete an issue or PR from the project.
 */

export async function removeFromProject(itemId: string) {
  if (!projectId) {
    await getProjectId()
  }

  return octokit.graphql(deleteProjectNextItemMutation, {
    projectId,
    itemId,
  })
}

export const deleteProjectNextItemMutation = `
  mutation DeleteProjectNextItemMutation($projectId: ID!, $itemId: ID!) {
    deleteProjectNextItem(input: { projectId: $projectId, itemId: $itemId }) {
      deletedItemId
    }
  }
`

/**
 * Fields
 */

export const fields = [
  'Cycle',
  'Needs discussion',
  'Priority',
  'Stale',
  'Rollovers',
  'Status',
] as const

type Fields = typeof fields[number]

export const fieldNamesToIds = new Map<Fields, string>()

export let currentCycleId
export let checkNeedsDiscussionId
export let checkStaleId

/**
 * Priorities
 */

export const priorities = [
  '🚨 Urgent',
  '1️⃣ High',
  '2️⃣ Medium',
  '3️⃣ Low',
] as const

export type Priorities = typeof priorities[number]

export const priorityNamesToIds = new Map<Priorities, string>()

/**
 * Statuses
 */

export const cycleStatuses = ['Todo', 'In progress', 'Needs review'] as const

export const statuses = [
  'Triage',
  'Backlog',
  ...cycleStatuses,
  'Done',
  'Archived',
] as const

export const nonCycleStatuses = statuses.filter(
  (status) => !cycleStatuses.includes(status)
)

export type Statuses = typeof statuses[number]

export const statusNamesToIds = new Map<Statuses, string>()

/**
 * Get project field and value names to ids
 */

export async function getProjectFieldAndValueNamesToIds() {
  if (
    currentCycleId &&
    checkNeedsDiscussionId &&
    checkStaleId &&
    fieldNamesToIds.size &&
    priorityNamesToIds.size &&
    statusNamesToIds.size
  ) {
    return {
      currentCycleId,
      checkNeedsDiscussionId,
      checkStaleId,
      fieldNamesToIds,
      priorityNamesToIds,
      statusNamesToIds,
    }
  }

  const nodes = await getProjectFields()

  /**
   * Cycle
   */

  const cycleField = nodes.find((field) => field.name === 'Cycle')
  fieldNamesToIds.set('Cycle', cycleField.id)
  ;[{ id: currentCycleId }] = JSON.parse(
    cycleField.settings
  ).configuration.iterations

  /**
   * Needs discussion
   */

  const needsDiscussionField = nodes.find(
    (field) => field.name === 'Needs discussion'
  )
  fieldNamesToIds.set('Needs discussion', needsDiscussionField.id)
  ;[{ id: checkNeedsDiscussionId }] = JSON.parse(
    needsDiscussionField.settings
  ).options

  /**
   * Priority
   */

  const priorityField = nodes.find((field) => field.name === 'Priority')

  fieldNamesToIds.set('Priority', priorityField.id)

  for (const priority of priorities) {
    const { id } = JSON.parse(priorityField.settings).options.find(
      (option: { id: string; name: string }) => option.name === priority
    )
    priorityNamesToIds.set(priority, id)
  }

  /**
   * Rollovers
   */

  const rolloversField = nodes.find((field) => field.name === 'Rollovers')
  fieldNamesToIds.set('Rollovers', rolloversField.id)

  /**
   * Stale
   */

  const staleField = nodes.find((field) => field.name === 'Stale')
  fieldNamesToIds.set('Stale', staleField.id)
  ;[{ id: checkStaleId }] = JSON.parse(staleField.settings).options

  /**
   * Status
   */

  const statusField = nodes.find((field) => field.name === 'Status')

  fieldNamesToIds.set('Status', statusField.id)

  for (const status of statuses) {
    const { id } = JSON.parse(statusField.settings).options.find(
      (option: { id: string; name: string }) => option.name === status
    )
    statusNamesToIds.set(status, id)
  }

  return {
    currentCycleId,
    checkNeedsDiscussionId,
    checkStaleId,
    fieldNamesToIds,
    priorityNamesToIds,
    statusNamesToIds,
  }
}

async function getProjectFields() {
  if (!projectId) {
    await getProjectId()
  }

  const {
    node: {
      fields: { nodes },
    },
  } = await octokit.graphql<GetProjectNextFieldsQueryRes>(
    getProjectNextFieldsQuery,
    {
      projectId,
    }
  )

  return nodes
}

export const getProjectNextFieldsQuery = `
  query GetProjectNextFieldsQuery($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectNext {
        fields(first: 100) {
          nodes {
            name
            id
            settings
          }
        }
      }
    }
  }
`

export type GetProjectNextFieldsQueryRes = {
  node: {
    fields: { nodes: Array<{ name: string; id: string; settings?: string }> }
  }
}

/**
 * Update a project item's fields
 */

export async function updateProjectItem(
  itemId: string,
  fieldValues: {
    Cycle?: boolean
    'Needs discussion'?: boolean
    Priority?: Priorities
    Stale?: boolean
    Rollovers?: number
    Status?: Statuses
  } = {}
) {
  return Promise.all(
    Object.entries(fieldValues).map(([field, value]) => {
      return updateProjectItemField({ itemId, field, value })
    })
  )
}

export async function updateProjectItemField({
  itemId,
  field,
  value,
}: {
  itemId: string
  field: Fields
  value?: boolean | number | Priorities | Statuses
}) {
  if (!fields.includes(field)) {
    throw new Error(`Invalid field ${field}`)
  }

  if (['Cycle', 'Needs discussion', 'Stale'].includes(field)) {
    if (value !== undefined && typeof value !== 'boolean') {
      throw new Error(
        [
          `Invalid value for ${field} field`,
          `Expected undefined or boolean, got ${typeof value}`,
        ].join('\n')
      )
    }
  } else if (field === 'Rollovers') {
    if (value !== undefined && typeof value !== 'number') {
      throw new Error(
        [
          `Invalid value for ${field} field`,
          `Expected undefined or number, got ${typeof value}`,
        ].join('\n')
      )
    }
  } else if (field === 'Priority') {
    if (typeof value !== 'string') {
      throw new Error(
        [
          `Invalid value for ${field} field`,
          `Expected string, got ${typeof value}`,
        ].join('\n')
      )
    }

    if (!priorities.includes(value)) {
      throw new Error(
        [
          `Invalid value for ${field} field`,
          `Expected string, got ${value}`,
        ].join('\n')
      )
    }
  } else if (field === 'Status') {
    if (typeof value !== 'string') {
      throw new Error(
        [
          `Invalid value for ${field} field`,
          `Expected string, got ${typeof value}`,
        ].join('\n')
      )
    }

    if (!statuses.includes(value)) {
      throw new Error(
        [
          `Invalid value for ${field} field`,
          `Expected string, got ${value}`,
        ].join('\n')
      )
    }
  }

  if (
    !currentCycleId ||
    !checkNeedsDiscussionId ||
    !checkStaleId ||
    !fieldNamesToIds.size ||
    !priorityNamesToIds.size ||
    !statusNamesToIds.size
  ) {
    await getProjectFieldAndValueNamesToIds()
  }

  const fieldId = fieldNamesToIds.get(field)

  let valueId

  switch (field) {
    case 'Cycle':
      valueId = value ? currentCycleId : ''
      break

    case 'Needs discussion':
      valueId = value ? checkNeedsDiscussionId : ''
      break

    case 'Priority':
      valueId = priorityNamesToIds.get(value)
      break

    case 'Stale':
      valueId = value ? checkStaleId : ''
      break

    case 'Rollovers':
      valueId = value ? value.toString() : ''
      break

    case 'Status':
      valueId = statusNamesToIds.get(value)
  }

  return octokit.graphql(updateProjectNextItemFieldMutation, {
    projectId,
    itemId,
    fieldId,
    value: valueId,
  })
}

export const updateProjectNextItemFieldMutation = `
  mutation UpdateProjectNextItemFieldMutation(
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

/**
 * Get an issue or PR's project item id from its id
 */

export async function getItemIdFromContentId(
  contentId: string,
  {
    after,
  }: {
    after?: string
  } = {}
): Promise<string | null> {
  if (!projectId) {
    await getProjectId()
  }

  const {
    node: { items },
  } = await octokit.graphql<GetItemIdFromContentIdQueryRes>(
    getItemIdFromContentIdQuery,
    {
      projectId,
      after,
    }
  )

  const item = items.nodes.find((item) => item.content.id === contentId)

  if (item) {
    return item.id
  }

  if (items.pageInfo.hasNextPage) {
    return getItemIdFromContentId(contentId, {
      after: items.pageInfo.endCursor,
    })
  }

  return null
}

export const getItemIdFromContentIdQuery = `
  query GetItemIdFromContentIdQuery($projectId: ID!, $after: String) {
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
`

export type GetItemIdFromContentIdQueryRes = {
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
}

/**
 * Get project items
 */

export async function getProjectItems(type?: Statuses) {
  if (type !== undefined && !statuses.includes(type)) {
    throw new Error(`Invalid type ${type}`)
  }

  const projectItems = await _getProjectItems()

  if (type === undefined) {
    return projectItems
  }

  return projectItems.filter((item) => {
    const statusField = getField(item, 'Status')
    return statusField?.value === statusNamesToIds.get(type)
  })
}

export function getField(projectNextItem, field: Fields) {
  return projectNextItem.fieldValues.nodes.find(
    (fieldValue) => fieldValue.projectField.name === field
  )
}

async function _getProjectItems(after?: string) {
  if (!projectId) {
    await getProjectId()
  }

  const {
    node: { items },
  } = await octokit.graphql<GetProjectItemsQueryRes>(getProjectItemsQuery, {
    projectId,
    after,
  })

  if (!items.pageInfo.hasNextPage) {
    return items.nodes
  }

  const nextItems = await _getProjectItems(items.pageInfo.endCursor)

  return [...items.nodes, ...nextItems]
}

export const getProjectItemsQuery = `
  query GetProjectItemsQuery($projectId: ID!, $after: String) {
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
              ...on Assignable {
                assignees(first: 5) {
                  nodes {
                    login
                  }
                }
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

export type GetProjectItemsQueryRes = {
  node: {
    items: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
      nodes: Array<{
        id: string
        title: string
        content: {
          url: string
          assignees: {
            nodes: Array<{
              login: string
            }>
          }
        }
        fieldValues: {
          nodes: Array<{
            id: string
            projectField: {
              settings: string
              name: string
            }
            value: string
          }>
        }
      }>
    }
  }
}
