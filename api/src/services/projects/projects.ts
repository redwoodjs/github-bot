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
