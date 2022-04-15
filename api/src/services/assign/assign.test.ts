import { octokit } from 'src/lib/github'

import { addAssigneesToAssignable, MUTATION } from './assign'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

describe('addAssigneesToAssignable ', () => {
  const variables = {
    assignableId: 'issue',
    assigneeIds: ['jtoar'],
  }

  it('uses the correct query', () => {
    expect(MUTATION).toMatchInlineSnapshot(`
      "
        mutation AddAssigneesToAssignable($assignableId: ID!, $assigneeIds: [ID!]!) {
          addAssigneesToAssignable(
            input: { assignableId: $assignableId, assigneeIds: $assigneeIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await addAssigneesToAssignable(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(MUTATION, variables)
  })
})
