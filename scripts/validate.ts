/**
 * Validate all open issues and PRs.
 *
 * @TODO
 *
 * - add other repos: sprout, example store
 */

import { execSync } from 'child_process'
import * as readline from 'readline'

import { octokit } from 'api/src/lib/github'
import { addIdsToProcessEnv } from 'api/src/services/github'
import {
  deleteFromMainProject,
  addToMainProject,
  updateMainProjectItemStatusFieldToTriage,
  updateMainProjectItemCycleFieldToCurrent,
  updateMainProjectItemCycleField,
  updateMainProjectItemField,
  getField,
} from 'api/src/services/projects'
import chalk from 'chalk'
import { Cli, Command, Option } from 'clipanion'
import * as dateFns from 'date-fns'
import fetch from 'node-fetch'

export default async () => {
  await addIdsToProcessEnv({ owner: 'redwoodjs', name: 'redwood' })

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

          switch (this.status) {
            case 'triage':
              return statusField.value === process.env.TRIAGE_STATUS_FIELD_ID
            case 'backlog':
              return statusField.value === process.env.BACKLOG_STATUS_FIELD_ID
            case 'todo':
              return statusField.value === process.env.TODO_STATUS_FIELD_ID
            case 'in progress':
              return (
                statusField.value === process.env.IN_PROGRESS_STATUS_FIELD_ID
              )
            default:
              return false
          }
        }
      )
    }

    const missingPriority = []
    const stale = []

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
            if (issueOrPullRequest.__typename === 'Issue') {
              validateLinkedPullRequests(issueOrPullRequest)
            } else {
              validateProject(issueOrPullRequest)
              validateStatus(issueOrPullRequest)
              validateCycle(issueOrPullRequest)
              validatePriority(issueOrPullRequest)
              validateStale(issueOrPullRequest)
            }
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
              await deleteFromMainProject(projectNextItem.id)
              break
            }

            if (e instanceof MissingProjectValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Adding to project board\n`
              )
              await addToMainProject(id)
              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof MissingStatusValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Adding to triage\n`
              )
              await updateMainProjectItemStatusFieldToTriage(projectNextItem.id)
              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof MissingCycleValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Adding to the current cycle\n`
              )
              await updateMainProjectItemCycleFieldToCurrent(projectNextItem.id)
              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof CycleValidationError) {
              this.context.stdout.write(
                `➤ ${chalk.blue('FIXING')}: Removing from the current cycle\n`
              )

              await updateMainProjectItemCycleField({
                itemId: projectNextItem.id,
                value: '',
              })

              issueOrPullRequest = await getIssueOrPullRequest(id)
              continue
            }

            if (e instanceof MissingPriorityValidationError) {
              missingPriority.push(issueOrPullRequest)
              break
            }

            if (e instanceof StaleError) {
              stale.push(issueOrPullRequest)
              break
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

    const issuesOrPullRequestsNeedAttention =
      missingPriority.length || stale.length

    if (issuesOrPullRequestsNeedAttention) {
      this.context.stdout.write(
        `  ➤ ${chalk.gray('INFO')}: ${
          missingPriority.length + stale.length
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

      if (stale.length) {
        for (const issueOrPullRequest of stale) {
          execSync(`open ${issueOrPullRequest.url}`)

          const answer = await question(
            `➤ ${chalk.yellow(
              'PROMPT'
            )}: This one is stale. Try to unblock it, but if you can't, enter "c" > `,
            {
              choices: ['c'],
            }
          )

          if (answer === 'c') {
            continue
          }

          const projectNextItem = getProjectNextItem(issueOrPullRequest)

          await updateMainProjectItemField({
            itemId: projectNextItem.id,
            fieldId: process.env.STALE_FIELD_ID,
            value: process.env.CHECK_STALE_FIELD_ID,
          })
        }
      }
    }
  }
}

async function getIssueOrPullRequest(id) {
  const { node: issueOrPullRequest } = await octokit.graphql<{
    node: IssueOrPullRequest
  }>(ISSUE_OR_PULL_REQUEST, { id })

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

const ISSUE_OR_PULL_REQUEST = `
  query ($id: ID!) {
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

async function validateLinkedPullRequests(issueOrPullRequest) {
  const res = await fetch(issueOrPullRequest.url, {
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  })
  const body = await res.text()
  const hasLinkedPr = new RegExp(
    'Successfully merging a pull request may close this issue'
  ).test(body)

  if (hasLinkedPr) {
    const projectNextItem = getProjectNextItem(issueOrPullRequest)
    const isInProject = projectNextItem !== undefined
    if (!isInProject) {
      return
    }

    const { id, title, url } = issueOrPullRequest

    throw new ProjectValidationError(id, title, url)
  }
}

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
    process.env.TODO_STATUS_FIELD_ID,
    process.env.IN_PROGRESS_STATUS_FIELD_ID,
  ].includes(statusField.value)

  const hasCycle = cycleField !== undefined

  const { id, title, url } = issueOrPullRequest

  if (hasTodoOrInProgressStatus && !hasCycle) {
    throw new MissingCycleValidationError(id, title, url)
  }

  const hasTriageOrBacklogStatus = [
    process.env.TRIAGE_STATUS_FIELD_ID,
    process.env.BACKLOG_STATUS_FIELD_ID,
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

  if (statusField.value === process.env.TRIAGE_STATUS_FIELD_ID) {
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

    if (hasntBeenUpdatedInAWeek) {
      const { id, title, url } = issueOrPullRequest
      throw new StaleError(id, title, url)
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

function getProjectNextItem(issueOrPullRequest: IssueOrPullRequest) {
  return issueOrPullRequest.projectNextItems.nodes.find(
    (projectNextItem) => projectNextItem.project.id === process.env.PROJECT_ID
  )
}

// ------------------------

async function getIssues(after?: string) {
  const {
    repository: { issues },
  } = await octokit.graphql(ISSUES, { after })

  if (!issues.pageInfo.hasNextPage) {
    return issues.nodes
  }

  const nextNodes = await getIssues(issues.pageInfo.endCursor)

  return [...issues.nodes, ...nextNodes]
}

const ISSUES = `
  query OpenIssues($after: String) {
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
  } = await octokit.graphql(PULL_REQUESTS, { after })

  if (!pullRequests.pageInfo.hasNextPage) {
    return pullRequests.nodes
  }

  const nextNodes = await getPullRequests(pullRequests.pageInfo.endCursor)

  return [...pullRequests.nodes, ...nextNodes]
}

const PULL_REQUESTS = `
  query OpenIssues($after: String) {
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
