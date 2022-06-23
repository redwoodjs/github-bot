import { octokit } from 'src/lib/github'

export const labels = [
  'action/add-to-cycle',
  'action/add-to-discussion-queue',
  'action/add-to-backlog',
] as const

export type Labels = typeof labels[number]

export const labelNamesToIds = new Map<Labels, string>()

/**
 * Get labels
 */

export async function getLabelNamesToIds() {
  if (labelNamesToIds.size) {
    return labelNamesToIds
  }

  const {
    repository: {
      labels: { nodes },
    },
  } = await octokit.graphql<GetLabelIdsQueryRes>(getLabelIdsQuery, {
    owner: process.env.OWNER,
    name: process.env.NAME,
  })

  for (const name of labels) {
    const { id } = nodes.find((label) => label.name === name)
    labelNamesToIds.set(name, id)
  }

  return labelNamesToIds
}

export const getLabelIdsQuery = `
  query GetLabelIdsQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      labels(first: 100) {
        nodes {
          name
          id
        }
      }
    }
  }
`

export type GetLabelIdsQueryRes = {
  repository: { labels: { nodes: Array<{ name: string; id: string }> } }
}

/**
 * Remove labels
 */

export async function removeLabel(
  labelableId: string,
  {
    label,
  }: {
    label: Labels
  }
) {
  if (!labels.includes(label)) {
    throw new Error(`Can't remove label ${label}`)
  }

  if (!labelNamesToIds.size) {
    await getLabelNamesToIds()
  }

  const labelId = labelNamesToIds.get(label)

  return octokit.graphql(removeLabelsFromLabelableMutation, {
    labelableId,
    labelIds: [labelId],
  })
}

export const removeLabelsFromLabelableMutation = `
  mutation RemoveLabelsFromLabelableMutation($labelableId: ID!, $labelIds: [ID!]!) {
    removeLabelsFromLabelable(
      input: { labelableId: $labelableId, labelIds: $labelIds }
    ) {
      clientMutationId
    }
  }
`
