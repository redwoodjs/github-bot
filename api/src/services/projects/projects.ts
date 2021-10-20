import { octokit } from 'src/lib/github'

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
  }>(
    `
      mutation AddProjectNextItem($projectId: ID!, $contentId: ID!) {
        addProjectNextItem(input: { projectId: $projectId, contentId: $contentId }) {
          projectNextItem {
            id
          }
        }
      }
    `,
    { projectId, contentId }
  )
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
  }>(
    `
      mutation DeleteProjectNextItem($projectId: ID!, $itemId: ID!) {
        deleteProjectNextItem(input: { projectId: $projectId, itemId: $itemId }) {
          deletedItemId
        }
      }
    `,
    { projectId, itemId }
  )
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
  }>(
    `
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
    `,
    {
      projectId,
      itemId,
      fieldId,
      value,
    }
  )
}
