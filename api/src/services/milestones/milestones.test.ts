import { octokit } from 'src/lib/github'

import { addMilestoneToPullRequest, MUTATION } from './milestones'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

describe('milestonePullRequest', () => {
  const variables = {
    pullRequestId: 'pull_request',
    milestoneId: '123-next-release',
  }

  it('uses the correct query', () => {
    expect(MUTATION).toMatchInlineSnapshot(`
      "
        mutation milestonePullRequest($pullRequestId: ID!, $milestoneId: ID!) {
          updatePullRequest(
            input: { pullRequestId: $pullRequestId, milestoneId: $milestoneId }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await addMilestoneToPullRequest(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(MUTATION, variables)
  })
})
