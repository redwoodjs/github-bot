import { octokit } from 'src/lib/github'

export function addMilestoneToPullRequest({
  pullRequestId,
  milestoneId,
}: {
  pullRequestId: string
  milestoneId: string
}) {
  return octokit.graphql<AddMilestoneToPullRequestRes>(MUTATION, {
    pullRequestId,
    milestoneId,
  })
}

export type AddMilestoneToPullRequestRes = {
  updatePullRequest: {
    clientMutationId: string
  }
}

export const MUTATION = `
  mutation milestonePullRequest($pullRequestId: ID!, $milestoneId: ID!) {
    updatePullRequest(
      input: { pullRequestId: $pullRequestId, milestoneId: $milestoneId }
    ) {
      clientMutationId
    }
  }
`

// ------------------------

export function addNextReleaseMilestoneToPullRequest(pullRequestId: string) {
  return addMilestoneToPullRequest({
    pullRequestId,
    milestoneId: process.env.NEXT_RELEASE_MILESTONE_ID,
  })
}

export function addChoreMilestoneToPullRequest(pullRequestId: string) {
  return addMilestoneToPullRequest({
    pullRequestId,
    milestoneId: process.env.CHORE_MILESTONE_ID,
  })
}
