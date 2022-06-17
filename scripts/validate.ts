/**
 * Validate all open issues and PRs.
 *
 * @TODO
 *
 * - add other repos: sprout, example store
 */

import { execSync } from 'node:child_process'
import * as readline from 'node:readline'

import { octokit } from 'api/src/lib/github'
import {
  addToProject,
  getField,
  getProjectFieldAndValueNamesToIds,
  projectId,
  getProjectId,
  removeFromProject,
  statusNamesToIds,
  updateProjectItem,
  currentCycleId,
} from 'api/src/services/projects/projects'
import chalk from 'chalk'
import { Cli, Command, Option } from 'clipanion'
import * as dateFns from 'date-fns'
import fetch from 'node-fetch'

export default async () => {
  process.env.OWNER = 'redwoodjs'
  process.env.NAME = 'redwood'

  const [_node, _rwCli, _execCommand, _scriptName, _prismaFlag, ...args] =
    process.argv

  const cli = new Cli()
  cli.register(ValidateCommand)
  cli.runExit(args)
}

// ------------------------

class ValidateCommand extends Command {
  issueOrPullRequestId = Option.String({ required: false })
  status = Option.String('--status', { required: false })

  issues = Option.Boolean('--issues', true)
  pullRequests = Option.Boolean('--pull-requests', true)

  async execute() {
    let issuesOrPullRequestsToValidate = []

    if (this.issueOrPullRequestId) {
      const issueOrPullRequest = await getIssueOrPullRequest(
        this.issueOrPullRequestId
      )
      issuesOrPullRequestsToValidate = [issueOrPullRequest]
    } else {
      let issues = []
      let pullRequests = []

      if (this.issues) {
        issues = await getIssues()
      }

      if (this.pullRequests) {
        pullRequests = await getPullRequests()
      }

      issuesOrPullRequestsToValidate = [...issues, ...pullRequests]
    }

    if (issuesOrPullRequestsToValidate.length > 1) {
      issuesOrPullRequestsToValidate = issuesOrPullRequestsToValidate
        .filter(
          (issueOrPullRequest) => issueOrPullRequest.author.login !== 'renovate'
        )
        .filter(
          (issueOrPullRequest) => !IGNORE_LIST.includes(issueOrPullRequest.id)
        )
    }

    if (!projectId) {
      await getProjectId()
    }

    if (!statusNamesToIds.size) {
      await getProjectFieldAndValueNamesToIds()
    }

    if (this.status) {
      issuesOrPullRequestsToValidate = issuesOrPullRequestsToValidate.filter(
        (issueOrPullRequest) => {
          const projectNextItem = getProjectNextItem(issueOrPullRequest)
          const isInProject = projectNextItem !== undefined
          if (!isInProject) {
            return false
          }

          const statusField = getField(projectNextItem, 'Status')
          const hasStatus = statusField !== undefined
          if (!hasStatus) {
            return false
          }

          return statusField.value === statusNamesToIds.get(this.status)
        }
      )
    }

    const missingPriority = []

    await Promise.allSettled(
      issuesOrPullRequestsToValidate.map(async (issueOrPullRequest) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            /**
             * - if it's an issue that's linked to a pull request, take it off the board
             * - otherwise, make sure it's on the board and has a status
             * - if it has a status of "Todo" or "In Progress", it should be in the current cycle
             * - unless it has a status of "Triage", it should have a priority
             */
            if (issueOrPullRequest.hasLinkedPr) {
              const projectNextItem = getProjectNextItem(issueOrPullRequest)
              const isInProject = projectNextItem !== undefined

              if (!isInProject) {
                break
              }

              const { id, title, url } = issueOrPullRequest

              throw new ProjectValidationError(id, title, url)
            }

            validateProject(issueOrPullRequest)
            validateStatus(issueOrPullRequest)
            validateCycle(issueOrPullRequest)
            validatePriority(issueOrPullRequest)
            validateStale(issueOrPullRequest)

            break
          } catch (e) {
            this.context.stdout.write(`➤ ${chalk.red('ERROR:')} ${e}\n`)
            const { url, id } = issueOrPullRequest
            this.context.stdout.write(
              `  ${chalk.gray(chalk.underline(url))} ${chalk.gray(id)}\n`
            )

            const projectNextItem = getProjectNextItem(issueOrPullRequest)

            if (e instanceof ProjectValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Removing from project board\n`
              )
              await removeFromProject(projectNextItem.id)
              break
            }

            if (e instanceof MissingProjectValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Adding to project board\n`
              )
              await addToProject(id)
              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof MissingStatusValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Adding to triage\n`
              )
              await updateProjectItem(projectNextItem.id, { Status: 'Triage' })
              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof MissingCycleValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Adding to the current cycle\n`
              )
              await updateProjectItem(projectNextItem.id, { Cycle: true })
              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof PreviousCycleValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue(
                  'FIXING'
                )}: Adding to the current cycle and incrementing rollovers\n`
              )
              await updateProjectItem(projectNextItem.id, { Cycle: true })

              const rolloversField = getField(projectNextItem, 'Rollovers')
              const rollovers = rolloversField?.value ?? 0

              await updateProjectItem(projectNextItem.id, {
                Rollovers: parseInt(rollovers) + 1,
              })

              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof CycleValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Removing from the current cycle\n`
              )

              await updateProjectItem(projectNextItem.id, { Cycle: false })

              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof MissingPriorityValidationError) {
              missingPriority.push(issueOrPullRequest)
              break
            }

            if (e instanceof StaleError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Marking as stale\n`
              )

              const projectNextItem = getProjectNextItem(issueOrPullRequest)

              await updateProjectItem(projectNextItem.id, { Stale: true })
            }

            if (e instanceof NotStaleError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Unmarking as stale\n`
              )

              const projectNextItem = getProjectNextItem(issueOrPullRequest)

              await updateProjectItem(projectNextItem.id, { Stale: false })
            }

            throw e
          }
        }

        const { id, title, url } = issueOrPullRequest

        this.context.stdout.write(
          `➤ ${chalk.green('OK')}: ${title} ${chalk.gray(
            chalk.underline(url)
          )} ${chalk.gray(id)}\n`
        )
      })
    )

    const issuesOrPullRequestsNeedAttention = missingPriority.length

    if (issuesOrPullRequestsNeedAttention) {
      this.context.stdout.write(
        `  ➤ ${chalk.gray('INFO')}: ${
          missingPriority.length
        } issues or pull requests need your attention`
      )

      if (missingPriority.length) {
        for (const issueOrPullRequest of missingPriority) {
          execSync(`open ${issueOrPullRequest.url}`)

          await question(
            `➤ ${chalk.yellow(
              'PROMPT'
            )}: Assign a priority to this issue or pull request, then enter anything to continue > `
          )
        }
      }
    }
  }
}

async function getIssueOrPullRequest(id: string) {
  const { node: issueOrPullRequest } = await octokit.graphql<{
    node: IssueOrPullRequest
  }>(issueOrPullRequestQuery, { id })

  return issueOrPullRequest
}

interface IssueOrPullRequest {
  __typename: 'Issue' | 'PullRequest'
  id: string
  title: string
  url: string
  updatedAt: string
  author: {
    login: string
  }
  projectNextItems: {
    nodes: Array<ProjectNextItem>
  }
}

interface ProjectNextItem {
  id: string
  fieldValues: {
    nodes: Array<{
      id: string
      projectField: {
        settings: string
        name: string
      }
      value: string
    }>
  }
  project: {
    id: string
    title: string
  }
}

const issueOrPullRequestQuery = `
  query IssueOrPullRequestQuery($id: ID!) {
    node(id: $id) {
      ...on Issue {
        __typename
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

      ...on PullRequest {
        __typename
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
`

/**
 * From https://github.com/google/zx.
 */
export async function question(query: string, options?: { choices: string[] }) {
  let completer = undefined

  if (Array.isArray(options?.choices)) {
    completer = function completer(line) {
      const completions = options.choices
      const hits = completions.filter((c) => c.startsWith(line))
      return [hits.length ? hits : completions, line]
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer,
  })

  return new Promise((resolve) =>
    rl.question(query ?? '', (answer) => {
      rl.close()
      resolve(answer)
    })
  )
}

// ------------------------

class ProjectValidationError extends Error {
  constructor(id, title, url) {
    super(`"${title}" is in the project but is linked to a pull request`)
    this.name = 'ProjectValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Just checks that the issue or pull request is in the project
 */
function validateProject(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const isInProject = projectNextItem !== undefined

  if (isInProject) {
    return
  }

  const { id, title, url } = issueOrPullRequest

  throw new MissingProjectValidationError(id, title, url)
}

class MissingProjectValidationError extends Error {
  constructor(id, title, url) {
    super(`"${title}" isn't in the project`)
    this.name = 'MissingProjectValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Just checks that the issue or pull request has a status.
 */
function validateStatus(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const hasStatus = statusField !== undefined

  if (hasStatus) {
    return
  }

  const { id, title, url } = issueOrPullRequest

  throw new MissingStatusValidationError(id, title, url)
}

class MissingStatusValidationError extends Error {
  constructor(id, title, url) {
    super(`"${title}" doesn't have a Status`)
    this.name = 'MissingStatusValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * If it has a status of "Todo" or "In Progress", it should be in the current cycle.
 * If it has a status of "Triage" or "Backlog", it shouldn't be in the current cycle.
 */
function validateCycle(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const cycleField = getField(projectNextItem, 'Cycle')

  const hasTodoOrInProgressStatus = [
    statusNamesToIds.get('Todo'),
    statusNamesToIds.get('In progress'),
  ].includes(statusField.value)

  const hasCycle = cycleField !== undefined
  const hasPreviousCycle = cycleField?.value !== currentCycleId

  const { id, title, url } = issueOrPullRequest

  if (hasTodoOrInProgressStatus) {
    if (!hasCycle) {
      throw new MissingCycleValidationError(id, title, url)
    }

    if (hasPreviousCycle) {
      throw new PreviousCycleValidationError(id, title, url)
    }
  }

  const hasTriageOrBacklogStatus = [
    statusNamesToIds.get('Triage'),
    statusNamesToIds.get('Backlog'),
  ].includes(statusField.value)

  if (hasTriageOrBacklogStatus && hasCycle) {
    throw new CycleValidationError(id, title, url)
  }
}

class MissingCycleValidationError extends Error {
  constructor(id, title, url) {
    super(
      `"${title}" has a Status of "Todo" or "In Progress" but isn't in the current cycle`
    )
    this.name = 'MissingCycleValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

class PreviousCycleValidationError extends Error {
  constructor(id, title, url) {
    super(`"${title}" is in the previous cycle`)
    this.name = 'PreviousCycleValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

class CycleValidationError extends Error {
  constructor(id, title, url) {
    super(`"${title}" has a Status of "Backlog" but is in the current cycle`)
    this.name = 'CycleValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Makes sure that an issue or pull request has a priority.
 *
 * @remarks
 *
 * Issues or pull requests with the "Triage" status don't need a priority.
 */
function validatePriority(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const priorityField = getField(projectNextItem, 'Priority')

  if (statusField.value === statusNamesToIds.get('Triage')) {
    return
  }

  const hasPriority = priorityField !== undefined

  if (hasPriority) {
    return
  }

  const { id, title, url } = issueOrPullRequest
  throw new MissingPriorityValidationError(id, title, url)
}

class MissingPriorityValidationError extends Error {
  constructor(id, title, url) {
    super(`"${title}" doesn't have a priority`)
    this.name = 'MissingPriorityValidationError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Checks if an issue or pull request hasn't been updated in a week.
 */
function validateStale(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const cycleField = getField(projectNextItem, 'Cycle')

  if (cycleField) {
    const hasntBeenUpdatedInAWeek = Boolean(
      dateFns.differenceInWeeks(
        new Date(),
        new Date(issueOrPullRequest.updatedAt)
      )
    )

    const { id, title, url } = issueOrPullRequest

    if (hasntBeenUpdatedInAWeek) {
      throw new StaleError(id, title, url)
    }

    const staleField = getField(projectNextItem, 'Stale')

    if (staleField) {
      throw new NotStaleError(id, title, url)
    }
  }
}

class StaleError extends Error {
  constructor(id, title, url) {
    super(
      `"${title}" is in the current cycle but hasn't been updated in a week`
    )
    this.name = 'StaleError'

    this.id = id
    this.title = title
    this.url = url
  }
}

class NotStaleError extends Error {
  constructor(id, title, url) {
    super(`"${title}" is marked stale but it isn't`)
    this.name = 'NotStaleError'

    this.id = id
    this.title = title
    this.url = url
  }
}

function getProjectNextItem(issueOrPullRequest: IssueOrPullRequest) {
  return issueOrPullRequest.projectNextItems.nodes.find(
    (projectNextItem) => projectNextItem.project.id === projectId
  )
}

// ------------------------

async function getIssues(after?: string) {
  let {
    repository: { issues },
  } = await octokit.graphql(openIssuesQuery, { after })

  if (!issues.pageInfo.hasNextPage) {
    return issues.nodes
  }

  const nextNodes = await getIssues(issues.pageInfo.endCursor)

  issues = [...issues.nodes, ...nextNodes]

  issues = await Promise.all(
    issues.map(async (issue) => {
      const res = await fetch(issue.url, {
        headers: {
          authorization: `token ${process.env.GITHUB_TOKEN}`,
        },
      })

      const body = await res.text()

      const hasLinkedPr = new RegExp(
        'Successfully merging a pull request may close this issue'
      ).test(body)

      return {
        ...issue,
        hasLinkedPr,
      }
    })
  )

  return issues
}

const openIssuesQuery = `
  query OpenIssuesQuery($after: String) {
    repository(owner: "redwoodjs", name: "redwood") {
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
          __typename
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
`

async function getPullRequests(after?: string) {
  const {
    repository: { pullRequests },
  } = await octokit.graphql(openPullRequestsQuery, { after })

  if (!pullRequests.pageInfo.hasNextPage) {
    return pullRequests.nodes
  }

  const nextNodes = await getPullRequests(pullRequests.pageInfo.endCursor)

  return [...pullRequests.nodes, ...nextNodes]
}

const openPullRequestsQuery = `
  query OpenPullRequestsQuery($after: String) {
    repository(owner: "redwoodjs", name: "redwood") {
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
          __typename
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
`

const IGNORE_LIST = [
  /**
   * Dependency Dashboard
   * https://github.com/redwoodjs/redwood/issues/3795
   */
  'I_kwDOC2M2f84_pAWH',
  /**
   * [Docs] Working Guidelines
   * https://github.com/redwoodjs/redwood/issues/332
   */
  'MDU6SXNzdWU1ODczNDg1NTQ=',
  /**
   * We ❤️ #Hacktoberfest: Here's How to Contribute to Redwood
   * https://github.com/redwoodjs/redwood/issues/1266
   */
  'MDU6SXNzdWU3MTQxNjcwNjY=',
  /**
   * 📢 Community Help Wanted 📢 - Help QA the new & improved Tutorial!
   * https://github.com/redwoodjs/redwood/issues/4820
   */
  'I_kwDOC2M2f85F9rMr',
]
