import { copycat } from '@snaplet/copycat'
import * as dateFns from 'date-fns'
import { setupServer } from 'msw/node'

import { installationHandler } from 'src/lib/github'
import {
  currentCycleId,
  projectId,
  fieldNamesToIds,
  getProjectId,
  getProjectFieldAndValueNamesToIds,
  statusNamesToIds,
} from 'src/services/projects'
import {
  Statuses,
  Priorities,
  checkStaleId,
} from 'src/services/projects/projects'
import handlers from 'src/services/projects/projects.handlers'

import {
  fields,
  getOpenIssuesQuery,
  getOpenPullRequestsQuery,
  validateCycle,
  validateProject,
  validateStatus,
  validateStale,
} from './validate'
import type { IssueOrPullRequest } from './validate'

const server = setupServer(installationHandler, ...handlers)

beforeAll(async () => {
  server.listen()
  await getProjectId()
  await getProjectFieldAndValueNamesToIds()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it.skip('uses the correct operations', () => {
  expect(fields).toMatchInlineSnapshot(`
    "
      id
      title
      url
      updatedAt
      author {
        login
      }
      projectNextItems(first: 10) {
        nodes {
          id
          fieldValues(first: 10) {
            nodes {
              id
              projectField {
                settings
                name
              }
              value
            }
          }
          project {
            id
            title
          }
        }
      }
    "
  `)

  expect(getOpenIssuesQuery).toMatchInlineSnapshot(`
    "
      query GetOpenIssuesQuery($after: String) {
        repository(owner: \\"redwoodjs\\", name: \\"redwood\\") {
          issues(
            first: 100
            states: OPEN
            orderBy: { field: CREATED_AT, direction: ASC }
            after: $after
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {

      id
      title
      url
      updatedAt
      author {
        login
      }
      projectNextItems(first: 10) {
        nodes {
          id
          fieldValues(first: 10) {
            nodes {
              id
              projectField {
                settings
                name
              }
              value
            }
          }
          project {
            id
            title
          }
        }
      }

            }
          }
        }
      }
    "
  `)

  expect(getOpenPullRequestsQuery).toMatchInlineSnapshot(`
    "
      query GetOpenPullRequestsQuery($after: String) {
        repository(owner: \\"redwoodjs\\", name: \\"redwood\\") {
          pullRequests(
            first: 100
            states: OPEN
            orderBy: { field: CREATED_AT, direction: ASC }
            after: $after
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {

      id
      title
      url
      updatedAt
      author {
        login
      }
      projectNextItems(first: 10) {
        nodes {
          id
          fieldValues(first: 10) {
            nodes {
              id
              projectField {
                settings
                name
              }
              value
            }
          }
          project {
            id
            title
          }
        }
      }

            }
          }
        }
      }
    "
  `)
})

it.skip('gets open issues', () => {})

it.skip('gets open pull requests', () => {})

function createIssueOrPullRequest(
  seed,
  {
    isInProject = true,
    updatedAt,
    ...options
  }: {
    isInProject?: boolean
    updatedAt?: string
    Cycle?: boolean | 'previous'
    Priority?: Priorities
    Stale?: boolean
    Status?: Statuses
  } = {
    Stale: false,
  }
): IssueOrPullRequest {
  const nodes = []

  if (isInProject) {
    nodes.push(createProjectItem(seed, options))
  }

  return {
    id: copycat.uuid(seed),
    title: copycat.sentence(seed),
    url: copycat.sentence(seed),
    updatedAt: updatedAt ?? copycat.dateString(seed),
    author: {
      login: copycat.username(seed),
    },
    projectNextItems: {
      nodes,
    },
  }
}

function createProjectItem(
  seed,
  {
    Cycle,
    Priority,
    Stale,
    Status,
  }: {
    Cycle?: boolean | 'previous'
    Priority?: Priorities
    Stale?: boolean
    Status?: Statuses
  } = {}
) {
  return {
    id: copycat.uuid(`${seed}bar`),
    fieldValues: {
      nodes: [
        Cycle && {
          id: fieldNamesToIds.get('Cycle'),
          projectField: {
            name: 'Cycle',
          },
          value: Cycle === 'previous' ? 'previous' : currentCycleId,
        },
        Priority && {
          id: fieldNamesToIds.get('Priority'),
          projectField: {
            name: 'Priority',
          },
          value: Priority,
        },
        Stale && {
          id: fieldNamesToIds.get('Stale'),
          projectField: {
            name: 'Stale',
          },
          value: checkStaleId,
        },
        Status && {
          id: fieldNamesToIds.get('Status'),
          projectField: {
            name: 'Status',
          },
          value: statusNamesToIds.get(Status),
        },
      ].filter(Boolean),
    },
    project: {
      id: projectId,
    },
  }
}

describe('validate project', () => {
  it("throws if an issue or pull request isn't in the project", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      isInProject: false,
    })

    try {
      validateProject(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[MissingProjectError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." isn't in the project]`
      )
    }
  })

  it('does nothing if an issue or pull request is in the project', () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo')

    validateProject(issueOrPullRequest)
  })
})

describe('validate status', () => {
  it("throws if an issue or pull request doesn't have a status", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo')

    try {
      validateStatus(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[MissingStatusError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." doesn't have a Status]`
      )
    }
  })

  it('does nothing if an issue or pull request has a status', () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Status: 'Triage',
    })

    validateStatus(issueOrPullRequest)
  })
})

describe('validate cycle', () => {
  it("throws if an issue or pull request has a status of 'Todo' or 'In progress' and isn't in the current cycle", () => {
    let issueOrPullRequest = createIssueOrPullRequest('foo', {
      isInProject: true,
      Status: 'Todo',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[MissingCycleValidationError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." has a Status of "Todo" or "In Progress" but isn't in the current cycle]`
      )
    }

    issueOrPullRequest = createIssueOrPullRequest('foo', {
      Status: 'In progress',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[MissingCycleValidationError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." has a Status of "Todo" or "In Progress" but isn't in the current cycle]`
      )
    }
  })

  it("throws if an issue or pull request has a status of 'Todo' or 'In progress' and is in the previous cycle", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: 'previous',
      Status: 'Todo',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[PreviousCycleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." is in the previous cycle]`
      )
    }
  })

  it("throws if an issue or pull request has a status of 'Triage' or 'Backlog' and is in the cycle", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: true,
      Status: 'Triage',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[CurrentCycleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." has a Status of "Triage" or "Backlog" but is in the current cycle]`
      )
    }
  })

  it("does nothing if an issue or pull request has a status of 'Todo' or 'In progress' and is in the current cycle", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: true,
      Status: 'Todo',
    })

    validateCycle(issueOrPullRequest)
  })
})

// describe('validate priority', () => {
//   it("throws if an issue or pull request doesn't have a priority", () => {
//     const issueOrPullRequest = createIssueOrPullRequest('foo', {
//       Cycle: true,
//       Status: 'In progress',
//     })

//     try {
//       validatePriority(issueOrPullRequest)
//     } catch (e) {
//       expect(e).toMatchInlineSnapshot()
//     }
//   })

//   it("does nothing if an issue or pull request has a priority or has a status of 'Triage'", () => {
//     let issueOrPullRequest = createIssueOrPullRequest('foo', {
//       Cycle: true,
//       Priority: '1️⃣ High',
//       Status: 'In progress',
//     })

//     validatePriority(issueOrPullRequest)

//     issueOrPullRequest = createIssueOrPullRequest('foo', {
//       Status: 'Triage',
//     })

//     validatePriority(issueOrPullRequest)
//   })
// })

describe('validate stale', () => {
  it("throws if an issue or pull request is in the current cycle and hasn't been updated in a week", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      updatedAt: dateFns.subWeeks(new Date(), 2).toISOString(),
      Cycle: true,
      Priority: '1️⃣ High',
      Status: 'In progress',
    })

    try {
      validateStale(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[StaleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." is in the current cycle but hasn't been updated in a week]`
      )
    }
  })

  it('throws if an issue or pull request in the current cycle is marked as stale but has been updated within a week', () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      updatedAt: new Date().toISOString(),
      Cycle: true,
      Priority: '1️⃣ High',
      Stale: true,
      Status: 'In progress',
    })

    try {
      validateStale(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[NotStaleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." is marked stale but isn't]`
      )
    }
  })

  it('does nothing if an issue or pull request is stale and already marked as stale', () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      updatedAt: dateFns.subWeeks(new Date(), 2).toISOString(),
      Cycle: true,
      Priority: '1️⃣ High',
      Stale: true,
      Status: 'In progress',
    })

    validateStale(issueOrPullRequest)
  })
})
