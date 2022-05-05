/**
 * Validate all open issues and PRs.
 *
 * - if is closed, merged, don't bother
 */

import { execSync } from 'child_process'
import * as readline from 'readline'

import { octokit } from 'api/src/lib/github'
import { addToProject, updateProjectItemField } from 'api/src/services/projects'
import chalk from 'chalk'
import { Cli, Command, Option } from 'clipanion'

const PROJECT_ID = 'PN_kwDOAq9qTM4ABn0O'

const STATUS_FIELD_ID = 'PNF_lADOAq9qTM4ABn0OzgA8U5Y'
const TRIAGE_VALUE_ID = '30985805'
const BACKLOG_VALUE_ID = '2f2ba648'
const IN_PROGRESS_VALUE_ID = '47fc9ee4'
const TODO_VALUE_ID = 'f75ad846'

const CYCLE_FIELD_ID = 'PNF_lADOAq9qTM4ABn0OzgA8VEw'
const CURRENT_CYCLE_VALUE_ID = '68005724'

export default async () => {
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
          this.context.stdout.write(`➤ ${chalk.red('ERROR')}\n`)
          this.context.stdout.write(`${e}\n`)

          if (e instanceof MissingProjectBoardValidationError) {
            this.context.stdout.write('➤ INFO: Adding to project board\n')

            await addToProject({
              projectId: PROJECT_ID,
              contentId: issueOrPullRequestId,
            })

            continue
          }

          const projectNextItem =
            issueOrPullRequest.projectNextItems.nodes.find(
              (projectNextItem) => projectNextItem.project.id === PROJECT_ID
            )

          if (e instanceof MissingStatusValidationError) {
            this.context.stdout.write('➤ INFO: Adding to triage\n')

            await updateProjectItemField({
              projectId: PROJECT_ID,
              itemId: projectNextItem.id,
              fieldId: STATUS_FIELD_ID,
              value: TRIAGE_VALUE_ID,
            })

            continue
          }

          if (e instanceof MissingCycleValidationError) {
            this.context.stdout.write('➤ INFO: Adding to the current cycle\n')

            await updateProjectItemField({
              projectId: PROJECT_ID,
              itemId: projectNextItem.id,
              fieldId: CYCLE_FIELD_ID,
              value: CURRENT_CYCLE_VALUE_ID,
            })

            continue
          }

          if (e instanceof CycleValidationError) {
            this.context.stdout.write(
              '➤ INFO: Removing from the current cycle\n'
            )

            await updateProjectItemField({
              projectId: PROJECT_ID,
              itemId: projectNextItem.id,
              fieldId: CYCLE_FIELD_ID,
              value: '',
            })

            continue
          }

          if (e instanceof MissingPriorityValidationError) {
            execSync(`open ${issueOrPullRequest.url}`)

            await prompt(
              "  When you've assigned a priority, press anything to continue"
            )

            continue
          }

          this.context.stdout.write('➤ INFO: Unhandled; re-throwing\n')

          throw e
        }
      }
    }
  }
}

async function prompt(message: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  return new Promise((resolve) => {
    return rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

class MissingProjectBoardValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MissingProjectBoardValidationError '
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

async function validateIssueOrPullRequest(
  issueOrPullRequest: IssueOrPullRequest
) {
  const projectNextItem = issueOrPullRequest.projectNextItems.nodes.find(
    (projectNextItem) => projectNextItem.project.id === PROJECT_ID
  )

  if (projectNextItem === undefined) {
    throw new MissingProjectBoardValidationError(
      [
        `${issueOrPullRequest.id} isn't on the project board`,
        issueOrPullRequest.title,
        issueOrPullRequest.url,
      ].join('\n')
    )
  }

  const statusField = projectNextItem.fieldValues.nodes.find(
    (fieldValue) => fieldValue.projectField.name === 'Status'
  )

  if (statusField === undefined) {
    throw new MissingStatusValidationError(
      [
        `${issueOrPullRequest.id} doesn't have a Status`,
        issueOrPullRequest.title,
        issueOrPullRequest.url,
      ].join('\n')
    )
  }

  const cycleField = projectNextItem.fieldValues.nodes.find(
    (fieldValue) => fieldValue.projectField.name === 'Cycle'
  )

  if (
    statusField.value === TODO_VALUE_ID ||
    statusField.value === IN_PROGRESS_VALUE_ID
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

  if (statusField.value === BACKLOG_VALUE_ID) {
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

  const priorityField = projectNextItem.fieldValues.nodes.find(
    (fieldValue) => fieldValue.projectField.name === 'Priority'
  )

  if (priorityField === undefined) {
    if (statusField.value !== TRIAGE_VALUE_ID) {
      throw new MissingPriorityValidationError(
        [
          `${issueOrPullRequest.id} doesn't have a Priority`,
          issueOrPullRequest.title,
          issueOrPullRequest.url,
        ].join('\n')
      )
    }
  }
}

interface IssueOrPullRequest {
  id: string
  title: string
  url: string
  projectNextItems: {
    nodes: Array<{
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
    }>
  }
}

const ISSUE_OR_PULL_REQUEST_QUERY = `
  query ($nodeId: ID!) {
    node(id: $nodeId) {
      ...on Issue {
        id
        title
        url
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
  // Dependency Dashboard
  // https://github.com/redwoodjs/redwood/issues/3795
  'I_kwDOC2M2f84_pAWH',
  // [Docs] Working Guidelines
  // https://github.com/redwoodjs/redwood/issues/332
  'MDU6SXNzdWU1ODczNDg1NTQ=',
  // We ❤️ #Hacktoberfest: Here's How to Contribute to Redwood
  // https://github.com/redwoodjs/redwood/issues/1266
  'MDU6SXNzdWU3MTQxNjcwNjY=',
]
