import chalk from 'chalk'
import * as dateFns from 'date-fns'
import fetch from 'node-fetch'

import { octokit } from 'src/lib/github'
import {
  addToProject,
  currentCycleId,
  cycleStatuses,
  getField,
  nonCycleStatuses,
  projectId,
  removeFromProject,
  statusNamesToIds,
  updateProjectItem,
} from 'src/services/projects'

export async function validateIssuesOrPullRequest(
  issueOrPullRequest: IssueOrPullRequest & { hasLinkedPullRequest?: boolean }
) {
  const report = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      /**
       * If it's an issue that's linked to a pull request,
       * remove it from the project. (If it's in the project.)
       *
       * Otherwise, onto the next one
       */
      if (issueOrPullRequest.hasLinkedPullRequest) {
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
      const { url, id } = issueOrPullRequest
      report.push(`  ┌ ${chalk.red('ERROR:')} ${e}`)
      report.push(
        `${report.length === 1 ? '➤' : ' '} │ ${chalk.gray(
          chalk.underline(url)
        )} ${chalk.gray(id)}`
      )

      const projectNextItem = getProjectNextItem(issueOrPullRequest)

      /**
       * It wasn't supposed to be in the project.
       * Remove it and move on (i.e. `break`).
       */
      if (e instanceof ProjectError) {
        await removeFromProject(projectNextItem.id)
        report.push(`  └ ${chalk.blue('FIXED')}: removed from the project`)
        break
      }

      /**
       * It's not in the project but it's supposed to be.
       * Add it, refetch it, and run the loop again.
       */
      if (e instanceof StrayError) {
        await addToProject(id)
        report.push(`  └ ${chalk.blue('FIXED')}: added to the project`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It doesn't have a status.
       * Add it to triage, refetch it, and run the loop again.
       */
      if (e instanceof MissingStatusError) {
        await updateProjectItem(projectNextItem.id, { Status: 'Triage' })
        report.push(`  └ ${chalk.blue('FIXED')}: added to triage`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It has a status of 'Todo' or 'In Progress', but it's not in the current cycle.
       * Add it to the current cycle, refetch it, and run the loop again.
       */
      if (e instanceof NoCycleError) {
        await updateProjectItem(projectNextItem.id, { Cycle: true })
        report.push(`  └ ${chalk.blue('FIXED')}: added to the current cycle`)
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

        report.push(
          `  └ ${chalk.blue(
            'FIXED'
          )}: added to the current cycle and incremented rollovers`
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
        report.push(
          `  └ ${chalk.blue('FIXED')}: removed from the current cycle`
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
        report.push(`  └ ${chalk.blue('FIXED')}: marked as stale`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * It's not stale, but is marked as stale.
       * Un-mark it, refetch it, and run the loop again.
       */
      if (e instanceof UpdatedError) {
        await updateProjectItem(projectNextItem.id, { Stale: false })
        report.push(`  └ ${chalk.blue('FIXED')}: cleared`)
        issueOrPullRequest = await getIssueOrPullRequest(id)
        continue
      }

      /**
       * If it comes to this, it's probably a bug.
       */
      throw e
    }
  }

  if (report.length) {
    this.context.stdout.write(`${report.join('\n')}\n`)
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

  const hasCycle = cycleField !== undefined

  const { id, title, url } = issueOrPullRequest

  if (
    cycleStatuses
      .map((cycleStatus) => statusNamesToIds.get(cycleStatus))
      .includes(statusField.value)
  ) {
    if (!hasCycle) {
      throw new NoCycleError(id, title, url)
    }

    const hasPreviousCycle = cycleField?.value !== currentCycleId

    if (hasPreviousCycle) {
      throw new PreviousCycleError(id, title, url)
    }
  }

  if (
    nonCycleStatuses
      .map((nonCycleStatus) => statusNamesToIds.get(nonCycleStatus))
      .includes(statusField.value) &&
    hasCycle
  ) {
    throw new CurrentCycleError(id, title, url)
  }
}

export class NoCycleError extends Error {
  constructor(id, title, url) {
    super(
      `"${title}" has a Status of "Todo", "In Progress", or "Needs review" but isn't in the current cycle`
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
  const {
    repository: { issues },
  } = await octokit.graphql(getOpenIssuesQuery, {
    after,
  })

  if (!issues.pageInfo.hasNextPage) {
    return issues.nodes
  }

  const nextNodes = await getOpenIssues(issues.pageInfo.endCursor)

  return [...issues.nodes, ...nextNodes]
}

export async function hasLinkedPullRequest(issue) {
  const res = await fetch(issue.url, {
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  })

  const body = await res.text()

  const hasLinkedPullRequest = new RegExp(
    'Successfully merging a pull request may close this issue'
  ).test(body)

  return {
    ...issue,
    hasLinkedPullRequest,
  }
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

/**
 * Comment on an issue or PR
 */

// [
//   'Thanks for opening ${an issue/a pull request}'
//   "I've assigned ${} to triage it.",
//   "${} please review this in the next few days",
// ]

// [
//   "Thanks for your patience ${}"
//   `🔔 @${content.author.login} this hasn't seen any activity for at least a week.`
//   "could you try to find the time to give it some attention?"
//   "thanks!"
// ]

// export async function getBody(content) {
//   const hasCoreTeamMaintainerAssigned =
//     content.assignees.nodes.length > 0 &&
//     content.assignees.nodes.some((assignee) =>
//       coreTeamMaintainers.includes(assignee.login)
//     )

//   const assignedCoreTeamMembers = content.assignees.nodes.filter((assignee) =>
//     coreTeamMaintainers.includes(assignee.login)
//   )

//   const authorIsCoreTeamMaintainer = coreTeamMaintainers.includes(
//     content.author.login
//   )

//   const body = []

//   if (!authorIsCoreTeamMaintainer) {
//     body.push(`Thanks for your patience @${content.author.login}!`)
//     body.push('\n')
//   }

//   if (!hasCoreTeamMaintainerAssigned) {
//     if (!authorIsCoreTeamMaintainer) {
//       body.push(
//         `🔔 @jtoar this hasn't seen any activity for at least a week and isn't assigned to anyone.`
//       )
//     } else {
//       body.push(
//         `🔔 @${content.author.login} this hasn't seen any activity for at least a week.`
//       )
//     }
//   } else {
//     body.push(
//       `🔔 ${assignedCoreTeamMembers
//         .map((assignee) => `@${assignee.login}`)
//         .join(', ')} this hasn't seen any activity for at least a week. `
//     )
//   }

//   body.concat([
//     `Could you prioritize this and determine a next step or where there's resistance?`,
//     `But if this isn't a priority, you can remove it from the current cycle I'll stop bothering you.`,
//   ])

//   return body.join(' ')
// }

// export async function comment(
//   subjectId: string,
//   {
//     body,
//   }: {
//     body: string
//   }
// ) {
//   return octokit.graphql(addCommentMutation, {
//     subjectId,
//     body,
//   })
// }

// const addCommentMutation = `
//   mutation AddCommentMutation(
//     $subjectId: ID!
//     $body: string!
//   ) {
//     addComment(
//       input: {
//         subjectId: $subjectId
//         body: $body
//       }
//     ) {
//       clientMutationId
//     }
//   }
// `
