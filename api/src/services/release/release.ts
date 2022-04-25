import { octokit } from 'src/lib/github'
import { removeLabels } from 'src/services/labels'
import {
  addToProject,
  deleteFromProject,
  updateProjectItemField,
  getContentItemIdOnProject,
} from 'src/services/projects'

export function addToReleaseProject(contentId: string) {
  return addToProject({ projectId: process.env.RELEASE_PROJECT_ID, contentId })
}

export function deleteFromReleaseProject(itemId: string) {
  return deleteFromProject({
    projectId: process.env.RELEASE_PROJECT_ID,
    itemId,
  })
}

/**
 * Give PRs opened by core team maintainers the "In progress" status.
 */
export function updateReleaseField({
  itemId,
  fieldId,
  value,
}: {
  itemId: string
  fieldId: string
  value: string
}) {
  return updateProjectItemField({
    projectId: process.env.RELEASE_PROJECT_ID,
    itemId,
    fieldId,
    value,
  })
}

// Status

export function updateReleaseStatusField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateReleaseField({
    itemId,
    fieldId: process.env.RELEASE_STATUS_FIELD_ID,
    value,
  })
}

export function updateReleaseStatusFieldToInProgress(itemId: string) {
  return updateReleaseStatusField({
    itemId,
    value: process.env.IN_PROGRESS_STATUS_FIELD_ID,
  })
}

export function updateReleaseStatusFieldToNewPRs(itemId: string) {
  return updateReleaseStatusField({
    itemId,
    value: process.env.NEW_PRS_STATUS_FIELD_ID,
  })
}

export function updateReleaseStatusFieldToDone(itemId: string) {
  return updateReleaseStatusField({
    itemId,
    value: process.env.DONE_STATUS_FIELD_ID,
  })
}

// Cycle

export function updateReleaseCycleField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateReleaseField({
    itemId,
    fieldId: process.env.RELEASE_CYCLE_FIELD_ID,
    value,
  })
}

export function updateReleaseCycleFieldToCurrent(itemId: string) {
  return updateReleaseCycleField({
    itemId,
    value: process.env.CURRENT_CYCLE_FIELD_ID,
  })
}

// ------------------------

export function removeAddToReleaseLabel(labelableId: string) {
  return removeLabels({
    labelableId,
    labelIds: [process.env.ADD_TO_RELEASE_LABEL_ID],
  })
}

export function getContentItemIdOnReleaseProject(
  contentId: string
): Promise<string | null> {
  return getContentItemIdOnProject({
    projectId: process.env.RELEASE_PROJECT_ID,
    contentId,
  })
}

export async function getReleaseProjectItems(after?: string) {
  const { node } = await octokit.graphql(
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
                id
                title
                isArchived
                fieldValues(first: 100) {
                  nodes {
                    projectField {
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
    `,
    {
      projectId: process.env.RELEASE_PROJECT_ID,
      after,
    }
  )

  if (!node.items.pageInfo.hasNextPage) {
    return node.items.nodes
  }

  const nodes = await getReleaseProjectItems(node.items.pageInfo.endCursor)

  return [...node.items.nodes, ...nodes]
}
