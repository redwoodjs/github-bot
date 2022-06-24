import * as dateFns from 'date-fns'
import { setupServer } from 'msw/node'

import { installationHandler } from 'src/lib/github'
import { getProjectFieldAndValueNamesToIds } from 'src/services/projects'
import projectHandlers, {
  clearIssuesOrPullRequests,
  createIssueOrPullRequest,
  issuesOrPullRequests,
  project,
} from 'src/services/projects/projects.handlers'

import {
  CurrentCycleError,
  MissingStatusError,
  NoCycleError,
  PreviousCycleError,
  StrayError,
  validateCycle,
  validateIssuesOrPullRequest,
  validateProject,
  validateStatus,
  validateStale,
} from './validate'
import handlers from './validate.handlers'

const server = setupServer(installationHandler, ...handlers, ...projectHandlers)

beforeAll(async () => {
  server.listen()
  await getProjectFieldAndValueNamesToIds()
})
afterEach(() => {
  clearIssuesOrPullRequests()
  project.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

describe('validateProject', () => {
  it("throws if an issue or pull request isn't in the project", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      isInProject: false,
    })

    try {
      validateProject(issueOrPullRequest)
    } catch (e) {
      expect(e).toBeInstanceOf(StrayError)
      expect(e).toMatchInlineSnapshot(
        `[StrayError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." isn't in the project]`
      )
    }
  })

  it('does nothing if an issue or pull request is in the project', () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo')

    validateProject(issueOrPullRequest)
  })
})

describe('validateStatus', () => {
  it("throws if an issue or pull request doesn't have a status", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo')

    try {
      validateStatus(issueOrPullRequest)
    } catch (e) {
      expect(e).toBeInstanceOf(MissingStatusError)
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

describe('validateCycle', () => {
  it("throws if an issue or pull request has a status of 'Todo' or 'In progress' and isn't in the current cycle", () => {
    let issueOrPullRequest = createIssueOrPullRequest('foo', {
      isInProject: true,
      Status: 'Todo',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toBeInstanceOf(NoCycleError)
      expect(e).toMatchInlineSnapshot(
        `[NoCycleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." has a Status of "Todo" or "In Progress" but isn't in the current cycle]`
      )
    }

    issueOrPullRequest = createIssueOrPullRequest('foo', {
      Status: 'In progress',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[NoCycleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." has a Status of "Todo" or "In Progress" but isn't in the current cycle]`
      )
    }
  })

  it("throws if an issue or pull request has a status of 'Todo' or 'In progress' and is in the previous cycle", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@previous',
      Status: 'Todo',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toBeInstanceOf(PreviousCycleError)
      expect(e).toMatchInlineSnapshot(
        `[PreviousCycleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." is in the previous cycle]`
      )
    }
  })

  it("throws if an issue or pull request has a status of 'Triage' or 'Backlog' and is in the cycle", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Status: 'Triage',
    })

    try {
      validateCycle(issueOrPullRequest)
    } catch (e) {
      expect(e).toBeInstanceOf(CurrentCycleError)
      expect(e).toMatchInlineSnapshot(
        `[CurrentCycleError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." has a Status of "Triage" or "Backlog" but is in the current cycle]`
      )
    }
  })

  it("does nothing if an issue or pull request has a status of 'Todo' or 'In progress' and is in the current cycle", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@current',
      Status: 'Todo',
    })

    validateCycle(issueOrPullRequest)
  })
})

describe('validateStale', () => {
  it("throws if an issue or pull request is in the current cycle and hasn't been updated in a week", () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@current',
      Status: 'In progress',
      updatedAt: dateFns.subWeeks(new Date(), 2).toISOString(),
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
      Cycle: '@current',
      Stale: true,
      Status: 'In progress',
      updatedAt: new Date().toISOString(),
    })

    try {
      validateStale(issueOrPullRequest)
    } catch (e) {
      expect(e).toMatchInlineSnapshot(
        `[UpdatedError: "Kiraevavi somani kihy viyoshi nihahyke kimeraeni." is marked as stale but isn't]`
      )
    }
  })

  it('does nothing if an issue or pull request is stale and already marked as stale', () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@current',
      Stale: true,
      Status: 'In progress',
      updatedAt: dateFns.subWeeks(new Date(), 2).toISOString(),
    })

    validateStale(issueOrPullRequest)
  })
})

describe('validateIssueOrPullRequest', () => {
  const logs = []

  const validate = validateIssuesOrPullRequest.bind({
    context: {
      stdout: {
        write(stdout) {
          logs.push(stdout)
        },
      },
    },
  })

  afterEach(() => {
    logs.length = 0
  })

  it('skips issues with linked pull requests', async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      hasLinkedPr: true,
      isInProject: false,
    })
    await validate(issueOrPullRequest)
    expect(logs.length).toBe(0)
  })

  it('removes issues with linked pull requests from the project', async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      hasLinkedPr: true,
    })

    await validate(issueOrPullRequest)
    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m ProjectError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" is in the project but is linked to a pull request
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: removed from the project
      ",
      ]
    `)
  })

  it('adds stray issues or pull requests to the project', async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      isInProject: false,
    })

    issuesOrPullRequests.push(issueOrPullRequest)
    await validate(issueOrPullRequest)

    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m StrayError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" isn't in the project
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: added to the project
      ",
        "┌ [31mERROR:[39m MissingStatusError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" doesn't have a Status
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: added to triage
      ",
      ]
    `)
  })

  it("adds issues or pull requests with a status of 'Todo' or 'In progress' to the current cycle", async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Status: 'Todo',
    })

    issuesOrPullRequests.push(issueOrPullRequest)
    project.items.push(issueOrPullRequest.projectNextItems.nodes[0])

    await validate(issueOrPullRequest)
    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m NoCycleError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" has a Status of \\"Todo\\" or \\"In Progress\\" but isn't in the current cycle
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: added to the current cycle
      ",
      ]
    `)
  })

  it('moves issues or pull requests from the previous cycle to the current one', async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@previous',
      Status: 'Todo',
    })

    issuesOrPullRequests.push(issueOrPullRequest)
    project.items.push(issueOrPullRequest.projectNextItems.nodes[0])

    await validate(issueOrPullRequest)
    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m PreviousCycleError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" is in the previous cycle
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: added to the current cycle and incremented rollovers
      ",
      ]
    `)
  })

  it("removes issue or pull request with a status of 'Triage' or 'Backlog' from the current cycle", async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@current',
      Status: 'Triage',
    })
    issuesOrPullRequests.push(issueOrPullRequest)
    project.items.push(issueOrPullRequest.projectNextItems.nodes[0])

    await validate(issueOrPullRequest)
    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m CurrentCycleError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" has a Status of \\"Triage\\" or \\"Backlog\\" but is in the current cycle
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: removed from the current cycle
      ",
      ]
    `)
  })

  it('marks stale issues or pull requests', async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@current',
      Status: 'Todo',
      updatedAt: dateFns.subWeeks(new Date(), 2).toISOString(),
    })
    issuesOrPullRequests.push(issueOrPullRequest)
    project.items.push(issueOrPullRequest.projectNextItems.nodes[0])

    await validate(issueOrPullRequest)
    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m StaleError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" is in the current cycle but hasn't been updated in a week
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: marked as stale
      ",
      ]
    `)
  })

  it('clears updated issues and pull requests', async () => {
    const issueOrPullRequest = createIssueOrPullRequest('foo', {
      Cycle: '@current',
      Stale: true,
      Status: 'Todo',
      updatedAt: new Date().toISOString(),
    })
    issuesOrPullRequests.push(issueOrPullRequest)
    project.items.push(issueOrPullRequest.projectNextItems.nodes[0])

    await validate(issueOrPullRequest)
    console.log(logs.join(''))
    expect(logs).toMatchInlineSnapshot(`
      Array [
        "┌ [31mERROR:[39m UpdatedError: \\"Kiraevavi somani kihy viyoshi nihahyke kimeraeni.\\" is marked as stale but isn't
      ",
        "│ [90m[4mKiraevavi somani kihy viyoshi nihahyke kimeraeni.[24m[39m [90m540b95dd-98a2-56fe-9c95-6e7123c148ca[39m
      ",
        "└ [34mFIXED[39m: cleared
      ",
      ]
    `)
  })
})
