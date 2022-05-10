/**
 * Validate all open issues and PRs.
 *
 * @TODO
 *
 * - add other repos: sprout, example store
 * - need to handle issues with prs—via proj board maybe?
 */

import { execSync } from 'child_process'
import * as readline from 'readline'

import { octokit } from 'api/src/lib/github'
import { addIdsToProcessEnv } from 'api/src/services/github'
import {
  addToMainProject,
  updateMainProjectItemStatusFieldToTriage,
  updateMainProjectItemCycleFieldToCurrent,
  updateMainProjectItemCycleField,
  updateMainProjectItemField,
} from 'api/src/services/projects'
import chalk from 'chalk'
import { Cli, Command, Option } from 'clipanion'
import * as dateFns from 'date-fns'

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
  issues = Option.Boolean('--issues', true)
  pullRequests = Option.Boolean('--pull-requests', true)

  async execute() {
    const { issueIds, pullRequestIds } = await getOpenIssueAndPullRequestIds()

    for (const issueOrPullRequestId of [
      ...(this.issues ? issueIds : []),
      ...(this.pullRequests ? pullRequestIds : []),
    ]) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { node: issueOrPullRequest } = await octokit.graphql<{
          node: IssueOrPullRequest
        }>(ISSUE_OR_PULL_REQUEST_QUERY, {
          nodeId: issueOrPullRequestId,
        })

        try {
          await validateIssueOrPullRequest(issueOrPullRequest)

          const { title, url } = issueOrPullRequest

          this.context.stdout.write(
            `➤ ${chalk.green('OK')}: ${chalk.blue(title)} ${chalk.underline(
              url
            )} ${chalk.grey(issueOrPullRequestId)}\n`
          )

          break
        } catch (e) {
          this.context.stdout.write(`➤ ${chalk.red('ERROR:')}\n`)
          this.context.stdout.write(`${e}\n`)

          if (e instanceof MissingProjectValidationError) {
            this.context.stdout.write('➤ INFO: Adding to project board\n')
            await addToMainProject(issueOrPullRequestId)
            continue
          }

          const projectNextItem = getProjectNextItem(issueOrPullRequest)

          if (e instanceof MissingStatusValidationError) {
            this.context.stdout.write('➤ INFO: Adding to triage\n')
            await updateMainProjectItemStatusFieldToTriage(projectNextItem.id)
            continue
          }

          if (e instanceof MissingCycleValidationError) {
            this.context.stdout.write('➤ INFO: Adding to the current cycle\n')
            await updateMainProjectItemCycleFieldToCurrent(projectNextItem.id)
            continue
          }

          if (e instanceof CycleValidationError) {
            this.context.stdout.write(
              '➤ INFO: Removing from the current cycle\n'
            )

            await updateMainProjectItemCycleField({
              itemId: projectNextItem.id,
              value: '',
            })

            continue
          }

          if (e instanceof MissingPriorityValidationError) {
            execSync(`open ${issueOrPullRequest.url}`)

            await question(
              "When you've assigned a priority, press anything to continue"
            )

            continue
          }

          if (e instanceof StaleError) {
            execSync(`open ${issueOrPullRequest.url}`)

            const answer = await question(
              `➤ ${chalk.yellow(
                'PROMPT'
              )}: Try to unblock this one, but if you can't, type "break" `,
              {
                choices: ['break'],
              }
            )

            if (answer === 'break') {
              await updateMainProjectItemField({
                itemId: projectNextItem.id,
                fieldId: process.env.STALE_FIELD_ID,
                value: process.env.CHECK_STALE_FIELD_ID,
              })

              break
            }

            continue
          }

          this.context.stdout.write('➤ INFO: Unhandled; re-throwing\n')

          throw e
        }
      }
    }
  }
}

interface IssueOrPullRequest {
  id: string
  title: string
  url: string
  updatedAt: string
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

const ISSUE_OR_PULL_REQUEST_QUERY = `
  query ($nodeId: ID!) {
    node(id: $nodeId) {
      ...on Issue {
        id
        title
        url
        updatedAt
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
        id
        title
        url
        updatedAt
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

class MissingProjectValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MissingProjectValidationError '
  }
}

class MissingStatusValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MissingStatusValidationError '
  }
}

class MissingCycleValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MissingCycleValidationError'
  }
}

class CycleValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CycleValidationError'
  }
}

class MissingPriorityValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MissingPriorityValidationError'
  }
}

class StaleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'StaleError'
  }
}

// ------------------------

/**
 * Make sure it's
 * - on the board
 * - has a status
 * - if it has a status of "Todo" or "In Progress", it should be in the current cycle
 * - unless it has a status of "Triage", it should have a priority
 */
async function validateIssueOrPullRequest(
  issueOrPullRequest: IssueOrPullRequest
) {
  validateProject(issueOrPullRequest)
  validateStatus(issueOrPullRequest)
  validateCycle(issueOrPullRequest)
  validatePriority(issueOrPullRequest)
  validateStale(issueOrPullRequest)
}

function validateProject(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)

  if (projectNextItem === undefined) {
    throw new MissingProjectValidationError(
      [
        `${issueOrPullRequest.id} isn't in the project`,
        issueOrPullRequest.title,
        issueOrPullRequest.url,
      ].join('\n')
    )
  }
}

function validateStatus(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')

  if (statusField === undefined) {
    throw new MissingStatusValidationError(
      [
        `${issueOrPullRequest.id} doesn't have a Status`,
        issueOrPullRequest.title,
        issueOrPullRequest.url,
      ].join('\n')
    )
  }
}

function validateCycle(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const cycleField = getField(projectNextItem, 'Cycle')

  if (
    [
      process.env.TODO_STATUS_FIELD_ID,
      process.env.IN_PROGRESS_STATUS_FIELD_ID,
    ].includes(statusField.value)
  ) {
    if (cycleField === undefined) {
      throw new MissingCycleValidationError(
        [
          `${issueOrPullRequest.id} has a Status of Todo or In Progress but isn't in the Current Cycle`,
          issueOrPullRequest.title,
          issueOrPullRequest.url,
        ].join('\n')
      )
    }
  }

  /**
   * If it has a status of "Triage" or "Backlog", it shouldn't be in the current cycle.
   */
  if (
    [
      process.env.TRIAGE_STATUS_FIELD_ID,
      process.env.BACKLOG_STATUS_FIELD_ID,
    ].includes(statusField.value)
  ) {
    if (cycleField) {
      throw new CycleValidationError(
        [
          `${issueOrPullRequest.id} has a Status of Backlog but is in the Current Cycle`,
          issueOrPullRequest.title,
          issueOrPullRequest.url,
        ].join('\n')
      )
    }
  }
}

function validatePriority(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const priorityField = getField(projectNextItem, 'Priority')

  if (statusField.value === process.env.TRIAGE_STATUS_FIELD_ID) {
    return
  }

  if (priorityField === undefined) {
    throw new MissingPriorityValidationError(
      [
        `${issueOrPullRequest.id} doesn't have a Priority`,
        issueOrPullRequest.title,
        issueOrPullRequest.url,
      ].join('\n')
    )
  }
}

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
      throw new StaleError(
        [
          `${issueOrPullRequest.id} is in the current cycle but hasn't been updated in a week`,
          issueOrPullRequest.title,
          issueOrPullRequest.url,
        ].join('\n')
      )
    }
  }
}

function getProjectNextItem(issueOrPullRequest: IssueOrPullRequest) {
  return issueOrPullRequest.projectNextItems.nodes.find(
    (projectNextItem) => projectNextItem.project.id === process.env.PROJECT_ID
  )
}

function getField(
  projectNextItem: ProjectNextItem,
  field: 'Status' | 'Cycle' | 'Priority'
) {
  return projectNextItem.fieldValues.nodes.find(
    (fieldValue) => fieldValue.projectField.name === field
  )
}

// ------------------------

/**
 * @FIXME there's some kind of doubling up that's happening here.
 */
async function getOpenIssueAndPullRequestIds({
  issuesAfter,
  pullRequestsAfter,
}: {
  issuesAfter?: string
  pullRequestsAfter?: string
} = {}) {
  const {
    repository: { issues, pullRequests },
  } = await octokit.graphql<Res>(QUERY, { issuesAfter, pullRequestsAfter })

  const issueIds = issues.nodes.map((issue) => issue.id)
  const pullRequestIds = pullRequests.nodes.map((pullRequest) => pullRequest.id)

  if (!issues.pageInfo.hasNextPage && !pullRequests.pageInfo.hasNextPage) {
    return { issueIds, pullRequestIds }
  }

  const { issueIds: nextIssueIds, pullRequestIds: nextPullRequestIds } =
    await getOpenIssueAndPullRequestIds({
      issuesAfter: issues.pageInfo.endCursor,
      pullRequestsAfter: pullRequests.pageInfo.endCursor,
    })

  return {
    issueIds: Array.from(new Set([...issueIds, ...nextIssueIds])).filter(
      (issueId) => !IGNORE_LIST.includes(issueId)
    ),
    pullRequestIds: Array.from(
      new Set([...pullRequestIds, ...nextPullRequestIds])
    ).filter((pullRequestId) => !IGNORE_LIST.includes(pullRequestId)),
  }
}

interface Res {
  repository: {
    issues: {
      pageInfo: PageInfo
      nodes: Array<{ id: string }>
    }
    pullRequests: {
      pageInfo: PageInfo
      nodes: Array<{ id: string }>
    }
  }
}

interface PageInfo {
  hasNextPage: boolean
  endCursor?: string
}

const QUERY = `
  query GetOpenIssuesAndPullRequests($issuesAfter: String, $pullRequestsAfter: String) {
    repository(owner: "redwoodjs", name: "redwood") {
      issues(
        first: 100
        states: OPEN
        orderBy: { field: CREATED_AT, direction: ASC }
        after: $issuesAfter
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
        }
      }
      pullRequests(
        first: 100
        states: OPEN
        orderBy: { field: CREATED_AT, direction: ASC }
        after: $pullRequestsAfter
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
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
   * Unable to Write Stories in MDX
   * https://github.com/redwoodjs/redwood/issues/5348
   *
   * @remarks
   *
   * Has a PR.
   */
  'I_kwDOC2M2f85Ikkdk',
]
