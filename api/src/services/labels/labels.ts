import { octokit } from 'src/lib/github'
// import { getRepositoryId } from 'src/services/github'

const COLOR = 'c2e0c6'

export const labels = [
  {
    name: 'action/add-to-cycle',
    color: COLOR,
    description: 'Use this label to add an issue or PR to the current cycle',
  },
  {
    name: 'action/add-to-discussion-queue',
    color: COLOR,
    description: 'Use this label to add an issue or PR to the discussion queue',
  },
  {
    name: 'action/add-to-backlog',
    color: COLOR,
    description: 'Use this label to add an issue or PR to the backlog',
  },
] as const

const labelNames = labels.map((label) => label.name)

export type Labels = typeof labelNames[number]

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

  for (const name of labelNames) {
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

export async function removeLabel({
  labelableId,
  label,
}: {
  labelableId: string
  label: Labels
}) {
  if (!labelNamesToIds.size) {
    await getLabelNamesToIds()
  }

  if (!labelNamesToIds.has(label)) {
    throw new Error(`Can't remove label ${label}`)
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

/**
 * Create labels
 */

// export async function createLabels() {
//   const repositoryId = await getRepositoryId()

//   return Promise.all(
//     labels.map((label) => {
//       return createLabel({
//         repositoryId,
//         ...label,
//       })
//     })
//   )
// }

// export function createLabel({
//   repositoryId,
//   name,
//   color,
//   description,
// }: {
//   repositoryId: string
//   name: Labels
//   color: typeof COLOR
//   description: string
// }) {
//   return octokit.graphql(createLabelMutation, {
//     repositoryId,
//     name,
//     color,
//     description,
//     headers: {
//       accept: 'application/vnd.github.bane-preview+json',
//     },
//   })
// }

export const createLabelMutation = `
  mutation CreateLabelMutation(
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
