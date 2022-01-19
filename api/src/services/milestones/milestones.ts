import { octokit } from 'src/lib/github'

export const MUTATION = `
  mutation milestonePullRequest($pullRequestId: ID!, $milestoneId: ID!) {
    updatePullRequest(
      input: { pullRequestId: $pullRequestId, milestoneId: $milestoneId }
    ) {
      clientMutationId
    }
  }
`

export type AddMilestoneToPullRequestRes = {
  updatePullRequest: {
    clientMutationId: string
  }
}

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

export function addNextReleaseMilestoneToPullRequest(pullRequestId: string) {
  addMilestoneToPullRequest({
    pullRequestId,
    milestoneId: process.env.NEXT_RELEASE_MILESTONE_ID,
  })
}

export function addChoreMilestoneToPullRequest(pullRequestId: string) {
  addMilestoneToPullRequest({
    pullRequestId,
    milestoneId: process.env.CHORE_MILESTONE_ID,
  })
}
