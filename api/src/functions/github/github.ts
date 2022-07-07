import type {
  Issue,
  IssuesEvent,
  IssuesLabeledEvent,
  IssuesOpenedEvent,
  PullRequest,
  PullRequestEvent,
  PullRequestLabeledEvent,
  PullRequestOpenedEvent,
} from '@octokit/webhooks-types'
import type { APIGatewayEvent, Context } from 'aws-lambda'

import { verifyEvent, WebhookVerificationError } from '@redwoodjs/api/webhooks'

import { startSmeeClient, coreTeamMaintainers } from 'src/lib/github'
import { logger } from 'src/lib/logger'
import { assign } from 'src/services/assign'
import { removeLabel } from 'src/services/labels'
import { milestonePullRequest } from 'src/services/milestones'
import {
  addToProject,
  updateProjectItem,
  getItemIdFromContentId,
} from 'src/services/projects'

if (process.env.NODE_ENV === 'development') {
  startSmeeClient()
}

type Event = APIGatewayEvent & {
  headers: { 'x-github-event': 'issues' | 'pull_request' }
}

type Payload = (IssuesEvent | PullRequestEvent) & {
  issue?: Issue
  pull_request?: PullRequest
}

export const handler = async (event: Event, _context: Context) => {
  console.log()
  console.log('-'.repeat(80))
  console.log()
  logger.info(
    {
      query: {
        delivery: event.headers['x-github-delivery'],
      },
    },
    'invoked github function'
  )

  try {
    verifyEvent('sha256Verifier', {
      event,
      secret: process.env.GITHUB_APP_WEBHOOK_SECRET,
      options: {
        signatureHeader: 'X-Hub-Signature-256',
      },
    })

    logger.info('webhook verified')

    const payload: Payload = JSON.parse(event.body)

    logger.info(
      {
        query: {
          repo: `${payload.organization.login}/${payload.repository.name}`,
          eventAction: `${event.headers['x-github-event']}.${payload.action}`,
          user: payload.sender.login,
          ...(payload.action === 'labeled' && {
            label: payload.label.name,
          }),
        },
      },
      payload.issue?.html_url ?? payload.pull_request.html_url
    )

    process.env.OWNER = payload.organization.login
    process.env.NAME = payload.repository.name

    const sifter = sift({
      'issues.opened': handleIssuesOpened,
      'issues.labeled': handleContentLabeled,
      'issues.closed': handleIssuesClosed,
      'pull_request.opened': handlePullRequestOpened,
      'pull_request.labeled': handleContentLabeled,
      'pull_request.closed': handlePullRequestClosed,
    })

    await sifter(event, payload)

    /**
     * What to return? See {@link https://docs.github.com/en/rest/guides/best-practices-for-integrators#provide-as-much-information-as-possible-to-the-user}
     */
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: 'github function',
      }),
    }
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      logger.warn('Unauthorized')

      return {
        statusCode: 401,
      }
    } else {
      logger.error(error, error.message)

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: error.message,
        }),
      }
    }
  } finally {
    console.log()
    console.log('-'.repeat(80))
    console.log()
  }
}

/**
 * When an issue's opened:
 *
 * - add it to the project
 * - assign a core team triage member
 *
 * @remarks
 *
 * If an issue's opened by a core team maintainer, they should triage it.
 */
async function handleIssuesOpened(payload: IssuesOpenedEvent) {
  if (coreTeamMaintainers.includes(payload.sender.login)) {
    logger.info("Author's a core team maintainer; returning")
    return
  }

  logger.info("Author isn't a core team maintainer")
  logger.info('Adding to project and assigning')
  const itemId = await addToProject(payload.issue.node_id)
  await updateProjectItem(itemId, { Status: 'Triage' })
  await assign(payload.issue.node_id, { to: 'Core Team/Triage' })
}

// ------------------------

async function handleContentLabeled(
  payload: (IssuesLabeledEvent | PullRequestLabeledEvent) & {
    issue?: Issue
    pull_request?: PullRequest
  }
) {
  const node_id = payload.issue?.node_id ?? payload.pull_request.node_id

  await removeLabel(node_id, { label: payload.label.name })
  const itemId = await addToProject(node_id)

  logger.info(`Content labeled ${payload.label.name}`)

  let options
  let report

  switch (payload.label.name) {
    case 'action/add-to-cycle':
      options = {
        Cycle: true,
        Status: 'In progress',
      }
      report = `Added to the current cycle`
      break

    case 'action/add-to-discussion-queue':
      options = { 'Needs discussion': true }
      report = `Added to the discussion queue`
      break

    case 'action/add-to-backlog':
      options = { Status: 'Backlog' }
      report = `Added to the backlog`
      break
  }

  await updateProjectItem(itemId, options)
  logger.info(report)
}

// ------------------------

async function handleIssuesClosed(payload: IssuesEvent) {
  const itemId = await getItemIdFromContentId(payload.issue.node_id)

  if (!itemId) {
    logger.info("Issue isn't in the project; returning")
    return
  }

  logger.info('Issue is on the board; moving to done')

  await updateProjectItem(itemId, { Status: 'Done' })
}

async function handlePullRequestOpened(payload: PullRequestOpenedEvent) {
  if (payload.sender.login === 'renovate[bot]') {
    logger.info('Pull request opened by renovate bot; returning')
    return
  }

  logger.info('Adding to project and assigning')
  const itemId = await addToProject(payload.pull_request.node_id)
  await updateProjectItem(itemId, { Status: 'Triage' })

  if (!coreTeamMaintainers.includes(payload.sender.login)) {
    logger.info("Author isn't a core team maintainer; assigning")
    await assign(payload.issue.node_id, { to: 'Core Team/Triage' })
    return
  }

  logger.info(
    'Author is a core team maintainer; updating the status field to in progress and adding to the current cycle'
  )
  await updateProjectItem(itemId, {
    Cycle: true,
    Status: 'In progress',
  })

  /**
   * Make sure the core team maintainer who opened the PR or another core team maintainer is assigned.
   */
  if (
    !(payload.pull_request as PullRequest).assignees.length ||
    !(payload.pull_request as PullRequest).assignees
      .map((assignee) => assignee.login)
      .some((login) => coreTeamMaintainers.includes(login))
  ) {
    logger.info(
      "The core team maintainer didn't assign themselves; assigning them"
    )

    await assign(payload.pull_request.node_id, { to: payload.sender.login })
  }
}

async function handlePullRequestClosed(payload: PullRequestEvent) {
  if (!payload.pull_request.merged) {
    logger.info('The pull request was closed; returning')
    return
  }

  if (payload.pull_request.base.ref === 'main') {
    logger.info('The pull request was merged to main')

    if (payload.pull_request.milestone?.title === 'next-release-patch') {
      logger.info(
        'The pull request already has the next-release-patch milestone; returning'
      )
      return
    }

    logger.info('Adding the next-release milestone')

    await milestonePullRequest(payload.pull_request.node_id, {
      milestone: 'next-release',
    })

    return
  } else {
    logger.info(
      `The pull request was merged into ${payload.pull_request.base.ref}`
    )

    logger.info('Adding the chore milestone')

    await milestonePullRequest(payload.pull_request.node_id, {
      milestone: 'chore',
    })
  }
}

/**
 * Utility for routing "event actions" to their handlers.
 */
type Events = 'issues' | 'pull_request'
type Actions = 'opened' | 'labeled' | 'closed'
export type EventActions = `${Events}.${Actions}`

type EventActionHandlers = Record<
  EventActions,
  (payload: Payload) => Promise<void>
>

function sift(eventActionHandlers: EventActionHandlers) {
  async function sifter(event: Event, payload: Payload) {
    const eventAction =
      `${event.headers['x-github-event']}.${payload.action}` as EventActions

    const handlers = Object.entries(eventActionHandlers)
      .filter(([key]) => key === eventAction)
      .map(([, fn]) => fn)

    if (!handlers.length) {
      logger.info(`No event-action handlers found for ${eventAction}`)
      return
    }

    logger.info(
      `Found ${handlers.length} event-action handler to run: ${handlers
        .map((handler) => handler.name)
        .join(', ')}`
    )

    await Promise.allSettled(handlers.map((handler) => handler(payload)))
  }

  return sifter
}
