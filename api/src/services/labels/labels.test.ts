import { removeLabels, MUTATION } from './labels'

import { octokit } from 'src/lib/github'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

describe('removeLabels', () => {
  const variables = {
    labelableId: 'issue',
    labelIds: ['action/add-to-release'],
  }

  it('uses the correct query', () => {
    expect(MUTATION).toMatchInlineSnapshot(`
      "
        mutation RemoveLabelsFromLabelable($labelableId: ID!, $labelIds: [ID!]!) {
          removeLabelsFromLabelable(
            input: { labelableId: $labelableId, labelIds: $labelIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await removeLabels(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(MUTATION, variables)
  })
})
