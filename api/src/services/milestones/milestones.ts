import { octokit } from 'src/lib/github'

export const milestones = ['next-release', 'chore'] as const

type Milestones = typeof milestones[number]

export const milestoneTitlesToIds = new Map<Milestones, string>()

/**
 * Get a map of milestone titles to ids
 */

export async function getMilestoneTitlesToIds() {
  if (milestoneTitlesToIds.size) {
    return milestoneTitlesToIds
  }

  const {
    repository: {
      milestones: { nodes },
    },
  } = await octokit.graphql<GetMilestoneIdsQueryRes>(getMilestoneIdsQuery, {
    owner: process.env.OWNER,
    name: process.env.NAME,
  })

  for (const milestone of milestones) {
    const { id } = nodes.find((node) => node.title === milestone)
    milestoneTitlesToIds.set(milestone, id)
  }

  return milestoneTitlesToIds
}

export const getMilestoneIdsQuery = `
  query GetMilestoneIdsQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      milestones(first: 100) {
        nodes {
          title
          id
        }
      }
    }
  }
`

export type GetMilestoneIdsQueryRes = {
  repository: { milestones: { nodes: Array<{ title: string; id: string }> } }
}

/**
 * Add a milestone
 */

export async function milestonePullRequest({
  pullRequestId,
  milestone,
}: {
  pullRequestId: string
  milestone: Milestones
}) {
  if (!milestoneTitlesToIds.size) {
    await getMilestoneTitlesToIds()
  }

  if (!milestoneTitlesToIds.has(milestone)) {
    throw new Error(`Can't add milestone ${milestone}`)
  }

  const milestoneId = milestoneTitlesToIds.get(milestone)

  return octokit.graphql(updatePullRequestMutation, {
    pullRequestId,
    milestoneId,
  })
}

export const updatePullRequestMutation = `
  mutation UpdatePullRequestMutation($pullRequestId: ID!, $milestoneId: ID!) {
    updatePullRequest(
      input: { pullRequestId: $pullRequestId, milestoneId: $milestoneId }
    ) {
      clientMutationId
    }
  }
`
