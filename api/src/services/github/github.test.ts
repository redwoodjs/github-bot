import { octokit } from 'src/lib/github'

import {
  getRedwoodJSRepositoryId,
  getRepositoryId,
  GET_REPOSITORY_ID,
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
      expect(GET_REPOSITORY_ID).toMatchInlineSnapshot(`
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
      expect(octokit.graphql).toHaveBeenCalledWith(GET_REPOSITORY_ID, variables)
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
      nodes: [{ title: 'Main', id: '123-Main' }],
    },
  },
}

const getProjectNextFieldRes: GetProjectNextFieldsRes = {
  node: {
    fields: {
      nodes: [
        {
          name: 'Cycle',
          id: 'cycle',
          settings:
            '{"width":104,"configuration":{"duration":14,"start_day":4,"iterations":[{"id":"68005724","title":"Cycle 2","duration":14,"start_date":"2022-05-02","title_html":"Cycle 2"},{"id":"8b194bbd","title":"Cycle 3","duration":14,"start_date":"2022-05-16","title_html":"Cycle 3"}],"completed_iterations":[]}}',
        },
        {
          name: 'Priority',
          id: 'priority',
          settings:
            '{"width":129,"options":[{"id":"ce369865","name":"🚨 Urgent","name_html":"<g-emoji class=\\"g-emoji\\" alias=\\"rotating_light\\" fallback-src=\\"https://github.githubassets.com/images/icons/emoji/unicode/1f6a8.png\\">🚨</g-emoji> Urgent"},{"id":"052e57cf","name":"1️⃣ High","name_html":"<g-emoji class=\\"g-emoji\\" alias=\\"one\\" fallback-src=\\"https://github.githubassets.com/images/icons/emoji/unicode/0031-20e3.png\\">1️⃣</g-emoji> High"},{"id":"8cc6ba48","name":"2️⃣ Medium","name_html":"<g-emoji class=\\"g-emoji\\" alias=\\"two\\" fallback-src=\\"https://github.githubassets.com/images/icons/emoji/unicode/0032-20e3.png\\">2️⃣</g-emoji> Medium"},{"id":"0a6d1555","name":"3️⃣ Low","name_html":"<g-emoji class=\\"g-emoji\\" alias=\\"three\\" fallback-src=\\"https://github.githubassets.com/images/icons/emoji/unicode/0033-20e3.png\\">3️⃣</g-emoji> Low"}]}',
        },
        {
          name: 'Status',
          id: 'status',
          settings:
            '{"width":127,"options":[{"id":"30985805","name":"Triage","name_html":"Triage"},{"id":"2f2ba648","name":"Backlog","name_html":"Backlog"},{"id":"f75ad846","name":"Todo","name_html":"Todo"},{"id":"47fc9ee4","name":"In Progress","name_html":"In Progress"},{"id":"98236657","name":"Done","name_html":"Done"},{"id":"04688006","name":"Archived","name_html":"Archived"}]}',
        },
        {
          name: 'Stale',
          id: 'stale',
          settings:
            '{"width":68,"options":[{"id":"290df9e2","name":"☑️","name_html":"<g-emoji class=\\"g-emoji\\" alias=\\"ballot_box_with_check\\" fallback-src=\\"https://github.githubassets.com/images/icons/emoji/unicode/2611.png\\">☑️</g-emoji>"}]}',
        },
        {
          name: 'Needs discussion',
          id: 'needs-discussion',
          settings:
            '{"width":148,"options":[{"id":"bde7db46","name":"☑️","name_html":"<g-emoji class=\\"g-emoji\\" alias=\\"ballot_box_with_check\\" fallback-src=\\"https://github.githubassets.com/images/icons/emoji/unicode/2611.png\\">☑️</g-emoji>"}]}',
        },
      ],
    },
  },
}

const getLabelIdsRes: GetLabelIdsRes = {
  repository: {
    labels: {
      nodes: [
        { name: 'action/add-to-cycle', id: '123-action/add-to-cycle' },
        {
          name: 'action/add-to-discussion-queue',
          id: '123-action/add-to-discussion-queue',
        },
        {
          name: 'action/add-to-backlog',
          id: '123-action/add-to-backlog',
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
  getProjectNextFieldRes,
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
  })

  it('is called with the correct mutations and queries ', async () => {
    await addIdsToProcessEnv({ owner: 'redwoodjs', name: 'redwood' })

    expect([
      GET_PROJECT_NEXT_TITLES_AND_IDS,
      GET_PROJECT_NEXT_FIELDS,
      GET_LABEL_IDS,
      GET_MILESTONE_IDS,
    ]).toEqual(
      expect.arrayContaining(octokit.graphql.mock.calls.map(([query]) => query))
    )
  })
})
