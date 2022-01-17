import { getRedwoodJSRepositoryId, getRepositoryId, QUERY } from './github'

import { octokit } from 'src/lib/github'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

const variables = {
  owner: 'redwoodjs',
  name: 'redwoodjs.com',
}

octokit.graphql.mockResolvedValue({
  repository: {
    id: variables.name,
  },
})

describe('getRepositoryId', () => {
  it('uses the correct query', () => {
    expect(QUERY).toMatchInlineSnapshot(`
      "
        query GetRepositoryId($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            id
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await getRepositoryId(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(QUERY, variables)
  })
})

describe('getRedwoodJSRepositoryId', () => {
  it('is called with owner as "redwoodjs"', async () => {
    octokit.graphql.mockClear()
    await getRedwoodJSRepositoryId(variables.name)
    expect(octokit.graphql.mock.calls[0][1].owner).toBe('redwoodjs')
  })
})
