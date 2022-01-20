import {
  getRedwoodJSRepositoryId,
  getRepositoryId,
  QUERY,
  addIdsToProcessEnv,
  GET_PROJECT_NEXT_TITLES_AND_IDS,
  GET_PROJECT_NEXT_FIELDS,
  GET_LABEL_IDS,
  GET_MILESTONE_IDS,
} from './github'
import type {
  GetProjectNextTitlesAndIdsRes,
  GetProjectNextFieldsRes,
  GetLabelIdsRes,
} from './github'

import { octokit } from 'src/lib/github'
import { GetMilestoneIdsRes } from '.'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

const variables = {
  owner: 'redwoodjs',
  name: 'redwood',
}

describe('getting repository ids', () => {
  beforeAll(() => {
    octokit.graphql.mockResolvedValue({
      repository: {
        id: variables.name,
      },
    })
  })

  afterEach(() => {
    octokit.graphql.mockClear()
  })

  afterAll(() => {
    octokit.graphql.mockReset()
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
      await getRedwoodJSRepositoryId(variables.name)
      expect(octokit.graphql.mock.calls[0][1].owner).toBe('redwoodjs')
    })
  })
})

const getProjectNextTitlesAndIdsRes: GetProjectNextTitlesAndIdsRes = {
  organization: {
    projectsNext: {
      nodes: [
        { title: 'Release', id: '123-Release' },
        { title: 'Triage', id: '123-Triage' },
      ],
    },
  },
}

const getReleaseFieldsRes: GetProjectNextFieldsRes = {
  node: {
    fields: {
      nodes: [
        {
          name: 'Status',
          id: 'status',
          settings:
            '{"options":[{"id":"123-New PRs","name":"New PRs"},{"id":"123-In progress","name":"In progress"},{"id":"123-Done","name":"Done"}]}',
        },
      ],
    },
  },
}

const getTriageFieldsRes: GetProjectNextFieldsRes = {
  node: {
    fields: {
      nodes: [
        {
          name: 'Status',
          id: 'status',
          settings:
            '{"options":[{"id":"123-Needs triage","name":"Needs triage"},{"id":"123-Needs discussion","name":"Needs discussion"},{"id":"123-Todo","name":"Todo"}]}',
        },
        {
          name: 'Priority',
          id: 'priority',
          settings: '{"options":[{"id":"123-TP1","name":"TP1"}]}',
        },
      ],
    },
  },
}

const getLabelIdsRes: GetLabelIdsRes = {
  repository: {
    labels: {
      nodes: [
        { name: 'action/add-to-release', id: '123-action/add-to-release' },
        {
          name: 'action/add-to-ctm-discussion-queue',
          id: '123-action/add-to-ctm-discussion-queue',
        },
        {
          name: 'action/add-to-v1-todo-queue',
          id: '123-action/add-to-v1-todo-queue',
        },
      ],
    },
  },
}

const getMilestoneIds: GetMilestoneIdsRes = {
  repository: {
    milestones: {
      nodes: [
        { title: 'next-release', id: '123-chore' },
        { title: 'chore', id: '123-chore' },
      ],
    },
  },
}

const resolvedValues = [
  getProjectNextTitlesAndIdsRes,
  getReleaseFieldsRes,
  getTriageFieldsRes,
  getLabelIdsRes,
  getMilestoneIds,
]

describe('addIdsToProcessEnv', () => {
  beforeAll(() => {
    for (const resolvedValue of resolvedValues) {
      octokit.graphql.mockResolvedValueOnce(resolvedValue)
    }
  })

  afterEach(() => {
    octokit.graphql.mockClear()
  })

  afterAll(() => {
    octokit.graphql.mockReset()
  })

  it('uses the correct queries', () => {
    expect(GET_PROJECT_NEXT_TITLES_AND_IDS).toMatchInlineSnapshot(`
      "
        query getProjectsNextTitlesAndIds($login: String!) {
          organization(login: $login) {
            projectsNext(first: 100) {
              nodes {
                title
                id
              }
            }
          }
        }
      "
    `)

    expect(GET_PROJECT_NEXT_FIELDS).toMatchInlineSnapshot(`
      "
        query getProjectNextFields($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectNext {
              fields(first: 100) {
                nodes {
                  name
                  id
                  settings
                }
              }
            }
          }
        }
      "
    `)

    expect(GET_LABEL_IDS).toMatchInlineSnapshot(`
      "
        query getLabelIds($login: String!, $name: String!) {
          repository(owner: $login, name: $name) {
            labels(first: 100) {
              nodes {
                name
                id
              }
            }
          }
        }
      "
    `)
  })

  expect(GET_MILESTONE_IDS).toMatchInlineSnapshot(`
    "
      query getMilestoneIds($login: String!, $name: String!) {
        repository(owner: $login, name: $name) {
          milestones(first: 100) {
            nodes {
              title
              id
            }
          }
        }
      }
    "
  `)

  it('is called with the correct mutations and queries ', async () => {
    await addIdsToProcessEnv({ owner: 'redwoodjs', name: 'redwood' })

    expect([
      GET_PROJECT_NEXT_TITLES_AND_IDS,
      GET_PROJECT_NEXT_FIELDS,
      GET_PROJECT_NEXT_FIELDS,
      GET_LABEL_IDS,
      GET_MILESTONE_IDS,
    ]).toEqual(
      expect.arrayContaining(octokit.graphql.mock.calls.map(([query]) => query))
    )
  })
})
