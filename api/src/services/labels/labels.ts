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
  }>(MUTATION, {
    labelableId,
    labelIds,
  })
}

export const MUTATION = `
  mutation RemoveLabelsFromLabelable($labelableId: ID!, $labelIds: [ID!]!) {
    removeLabelsFromLabelable(
      input: { labelableId: $labelableId, labelIds: $labelIds }
    ) {
      clientMutationId
    }
  }
`
