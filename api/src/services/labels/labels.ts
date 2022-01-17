import { octokit } from 'src/lib/github'

export function removeLabels({
  labelableId,
  labelIds,
}: {
  labelableId: string
  labelIds: string[]
}) {
  return octokit.graphql<{
    removeLabelsFromLabelable: {
      clientMutationId: string
    }
  }>(REMOVE_LABELS_MUTATION, {
    labelableId,
    labelIds,
  })
}

export const REMOVE_LABELS_MUTATION = `
  mutation RemoveLabelsFromLabelable($labelableId: ID!, $labelIds: [ID!]!) {
    removeLabelsFromLabelable(
      input: { labelableId: $labelableId, labelIds: $labelIds }
    ) {
      clientMutationId
    }
  }
`

export function createLabel({
  repositoryId,
  name,
  color,
  description,
}: {
  repositoryId: string
  name: string
  color: string
  description: string
}) {
  return octokit.graphql<{ label: { id: string } }>(CREATE_LABEL_MUTATION, {
    repositoryId,
    name,
    color,
    description,
    headers: {
      accept: 'application/vnd.github.bane-preview+json',
    },
  })
}

export const CREATE_LABEL_MUTATION = `
  mutation createLabel(
    $repositoryId: ID!
    $name: String!
    $color: String!
    $description: String!
  ) {
    createLabel(
      input: {
        repositoryId: $repositoryId
        name: $name
        color: $color
        description: $description
      }
    ) {
      label {
        name
        id
      }
    }
  }
`

const actionLabelsColor = 'c2e0c6'

export const actionLabels = [
  {
    name: 'action/add-to-release',
    color: actionLabelsColor,
    description: 'Use this label to add an issue or PR to the release project',
  },
  {
    name: 'action/add-to-ctm-discussion-queue',
    color: actionLabelsColor,
    description:
      'Use this label to add an issue or PR to the core team meeting discussion queue',
  },
]

export function createActionLabelsInRedwoodJSRepository(repositoryId) {
  return Promise.allSettled(
    actionLabels.map((actionLabel) =>
      createLabel({
        repositoryId,
        ...actionLabel,
      })
    )
  )
}
