import chalk from 'chalk'
import * as dateFns from 'date-fns'
import fetch from 'node-fetch'

import { octokit } from 'src/lib/github'
import {
  addToProject,
  currentCycleId,
  getField,
  projectId,
  removeFromProject,
  statusNamesToIds,
  updateProjectItem,
} from 'src/services/projects'

export async function validateIssuesOrPullRequest(
  issueOrPullRequest: IssueOrPullRequest & { hasLinkedPr?: boolean }
) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      /**
       * If it's an issue that's linked to a pull request,
       * remove it from the project. (If it's in the project.)
       *
       * Otherwise, onto the next one
       */
      if (issueOrPullRequest.hasLinkedPr) {
        if (!isInProject(issueOrPullRequest)) {
          break
        }
        const { id, title, url } = issueOrPullRequest
        throw new ProjectError(id, title, url)
      }
      validateProject(issueOrPullRequest)
      validateStatus(issueOrPullRequest)
      validateCycle(issueOrPullRequest)
      validateStale(issueOrPullRequest)
      break
    } catch (e) {
      this.context.stdout.write(`┌ ${chalk.red('ERROR:')} ${e}\n`)
      const { url, id } = issueOrPullRequest
      this.context.stdout.write(
        `│ ${chalk.gray(chalk.underline(url))} ${chalk.gray(id)}\n`
      )

      const projectNextItem = getProjectNextItem(issueOrPullRequest)

      /**
       * It wasn't supposed to be in the project.
       * Remove it and move on (i.e. `break`).
       */
      if (e instanceof ProjectError) {
        await removeFromProject(projectNextItem.id)
        this.context.stdout.write(
          `└ ${chalk.blue('FIXED')}: removed from the project\n`
        )
        break
      }

      /**
       * It's not in the project but it's supposed to be.
       * Add it, refetch it, and run the loop again.
       */
      if (e instanceof StrayError) {
        await addToProject(id)
        this.context.stdout.write(
          `└ ${chalk.blue('FIXED')}: added to the project\n`
        )
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It doesn't have a status.
       * Add it to triage, refetch it, and run the loop again.
       */
      if (e instanceof MissingStatusError) {
        await updateProjectItem(projectNextItem.id, { Status: 'Triage' })
        this.context.stdout.write(`└ ${chalk.blue('FIXED')}: added to triage\n`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It has a status of 'Todo' or 'In Progress', but it's not in the current cycle.
       * Add it to the current cycle, refetch it, and run the loop again.
       */
      if (e instanceof NoCycleError) {
        await updateProjectItem(projectNextItem.id, { Cycle: true })
        this.context.stdout.write(
          `└ ${chalk.blue('FIXED')}: added to the current cycle\n`
        )
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It's in the previous cycle.
       * Add it to the current one, increment rollovers, refetch it, and run the loop again.
       */
      if (e instanceof PreviousCycleError) {
        const rolloversField = getField(projectNextItem, 'Rollovers')
        const rollovers = rolloversField?.value ?? 0

        await updateProjectItem(projectNextItem.id, {
          Cycle: true,
          Rollovers: parseInt(rollovers) + 1,
        })

        this.context.stdout.write(
          `└ ${chalk.blue(
            'FIXED'
          )}: added to the current cycle and incremented rollovers\n`
        )

        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It's in the current cycle but isn't supposed to be.
       * Remove it, refetch it, and run the loop again.
       */
      if (e instanceof CurrentCycleError) {
        await updateProjectItem(projectNextItem.id, { Cycle: false })
        this.context.stdout.write(
          `└ ${chalk.blue('FIXED')}: removed from the current cycle\n`
        )
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It's stale, but isn't marked as stale.
       * Mark it, refetch it, and run the loop again.
       */
      if (e instanceof StaleError) {
        await updateProjectItem(projectNextItem.id, { Stale: true })
        this.context.stdout.write(`└ ${chalk.blue('FIXED')}: marked as stale\n`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It's not stale, but is marked as stale.
       * Un-mark it, refetch it, and run the loop again.
       */
      if (e instanceof UpdatedError) {
        await updateProjectItem(projectNextItem.id, { Stale: false })
        this.context.stdout.write(`└ ${chalk.blue('FIXED')}: cleared\n`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * If it comes to this, it's probably a bug.
       */
      throw e
    }
  }
}

export class ProjectError extends Error {
  constructor(id, title, url) {
    super(`"${title}" is in the project but is linked to a pull request`)
    this.name = 'ProjectError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Throws if an issue or pull request isn't in the main project.
 */
export function validateProject(issueOrPullRequest: IssueOrPullRequest) {
  if (isInProject(issueOrPullRequest)) {
    return
  }

  const { id, title, url } = issueOrPullRequest

  throw new StrayError(id, title, url)
}

export class StrayError extends Error {
  constructor(id, title, url) {
    super(`"${title}" isn't in the project`)
    this.name = 'StrayError'

    this.id = id
    this.title = title
    this.url = url
  }
}

function isInProject(issueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  return projectNextItem !== undefined
}

/**
 * Just checks that the issue or pull request has a status.
 */
export function validateStatus(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const hasStatus = statusField !== undefined

  if (hasStatus) {
    return
  }

  const { id, title, url } = issueOrPullRequest

  throw new MissingStatusError(id, title, url)
}

export class MissingStatusError extends Error {
  constructor(id, title, url) {
    super(`"${title}" doesn't have a Status`)
    this.name = 'MissingStatusError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * If an issue or pull request has a status of "Todo" or "In Progress",
 * it should be in the current cycle.
 * If it has a status of "Triage" or "Backlog",
 * it shouldn't be in the current cycle.
 */
export function validateCycle(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const statusField = getField(projectNextItem, 'Status')
  const cycleField = getField(projectNextItem, 'Cycle')

  const hasTodoOrInProgressStatus = [
    statusNamesToIds.get('Todo'),
    statusNamesToIds.get('In progress'),
  ].includes(statusField.value)

  const hasCycle = cycleField !== undefined

  const { id, title, url } = issueOrPullRequest

  if (hasTodoOrInProgressStatus) {
    if (!hasCycle) {
      throw new NoCycleError(id, title, url)
    }

    const hasPreviousCycle = cycleField?.value !== currentCycleId

    if (hasPreviousCycle) {
      throw new PreviousCycleError(id, title, url)
    }
  }

  const hasTriageOrBacklogStatus = [
    statusNamesToIds.get('Triage'),
    statusNamesToIds.get('Backlog'),
  ].includes(statusField.value)

  if (hasTriageOrBacklogStatus && hasCycle) {
    throw new CurrentCycleError(id, title, url)
  }
}

export class NoCycleError extends Error {
  constructor(id, title, url) {
    super(
      `"${title}" has a Status of "Todo" or "In Progress" but isn't in the current cycle`
    )
    this.name = 'NoCycleError'

    this.id = id
    this.title = title
    this.url = url
  }
}

export class PreviousCycleError extends Error {
  constructor(id, title, url) {
    super(`"${title}" is in the previous cycle`)
    this.name = 'PreviousCycleError'

    this.id = id
    this.title = title
    this.url = url
  }
}

export class CurrentCycleError extends Error {
  constructor(id, title, url) {
    super(
      `"${title}" has a Status of "Triage" or "Backlog" but is in the current cycle`
    )
    this.name = 'CurrentCycleError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Checks if an issue or pull request hasn't been updated in a week.
 */
export function validateStale(issueOrPullRequest: IssueOrPullRequest) {
  const projectNextItem = getProjectNextItem(issueOrPullRequest)
  const cycleField = getField(projectNextItem, 'Cycle')

  if (!cycleField) {
    return
  }

  const hasntBeenUpdatedInAWeek = Boolean(
    dateFns.differenceInWeeks(
      new Date(),
      new Date(issueOrPullRequest.updatedAt)
    )
  )

  const staleField = getField(projectNextItem, 'Stale')

  const { id, title, url } = issueOrPullRequest

  if (hasntBeenUpdatedInAWeek) {
    if (staleField) {
      return
    }

    throw new StaleError(id, title, url)
  }

  if (staleField) {
    throw new UpdatedError(id, title, url)
  }
}

export class StaleError extends Error {
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

export class UpdatedError extends Error {
  constructor(id, title, url) {
    super(`"${title}" is marked as stale but isn't`)
    this.name = 'UpdatedError'

    this.id = id
    this.title = title
    this.url = url
  }
}

/**
 * Get open issues or pull requests
 */

export const fields = `
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
`

export async function getOpenIssues(after?: string) {
  let {
    repository: { issues },
  } = await octokit.graphql(getOpenIssuesQuery, {
    after,
  })

  if (!issues.pageInfo.hasNextPage) {
    return issues.nodes
  }

  const nextNodes = await getOpenIssues(issues.pageInfo.endCursor)

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

export const getOpenIssuesQuery = `
  query GetOpenIssuesQuery($after: String) {
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
          ${fields}
        }
      }
    }
  }
`

export async function getOpenPullRequests(after?: string) {
  const {
    repository: { pullRequests },
  } = await octokit.graphql(getOpenPullRequestsQuery, { after })

  if (!pullRequests.pageInfo.hasNextPage) {
    return pullRequests.nodes
  }

  const nextNodes = await getOpenPullRequests(pullRequests.pageInfo.endCursor)

  return [...pullRequests.nodes, ...nextNodes]
}

export const getOpenPullRequestsQuery = `
  query GetOpenPullRequestsQuery($after: String) {
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
          ${fields}
        }
      }
    }
  }
`

export async function getIssueOrPullRequest(id: string) {
  const { node: issueOrPullRequest } = await octokit.graphql<{
    node: IssueOrPullRequest
  }>(getIssueOrPullRequestQuery, { id })

  return issueOrPullRequest
}

export const getIssueOrPullRequestQuery = `
  query GetIssueOrPullRequestQuery($id: ID!) {
    node(id: $id) {
      ...on Issue {
        ${fields}
      }

      ...on PullRequest {
        ${fields}
      }
    }
  }
`

export interface IssueOrPullRequest {
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

export interface ProjectNextItem {
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

export function getProjectNextItem(issueOrPullRequest: IssueOrPullRequest) {
  return issueOrPullRequest.projectNextItems.nodes.find(
    (projectNextItem) => projectNextItem.project.id === projectId
  )
}
