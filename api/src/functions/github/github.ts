import type { APIGatewayEvent, Context } from 'aws-lambda'
import { logger } from 'src/lib/logger'
import {
  startSmeeClient,
  coreTeamMaintainerLogins,
  coreTeamMaintainers,
} from 'src/lib/github'
import { addIdsToProcessEnv } from 'src/services/github'
import {
  addToReleaseProject,
  updateReleaseStatusFieldToNewPRs,
  updateReleaseStatusFieldToInProgress,
  removeAddToReleaseLabel,
} from 'src/services/release'

import {
  addToTriageProject,
  addToCTMDiscussionQueue,
  getIssueItemIdOnTriageProject,
  deleteFromTriageProject,
  removeAddToCTMDiscussionQueueLabel,
  assignCoreTeamTriage,
} from 'src/services/triage'
import { addAssigneesToAssignable } from 'src/services/assign'
import { verifyEvent, WebhookVerificationError } from '@redwoodjs/api/webhooks'
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

if (process.env.NODE_ENV === 'development') {
  startSmeeClient()
}

/**
 * Typing the GitHub event. There's probably a better way to do this.
 */
type Event = APIGatewayEvent & {
  headers: { 'x-github-event': 'issues' | 'pull_request' }
}
/**
 * The app's only subscribed to issues and pull requests .
 */
type Payload = IssuesEvent | PullRequestEvent

function getLoggerQuery(event: Event, payload?: Payload) {
  return {
    delivery: event.headers['x-github-delivery'],
    event: event.headers['x-github-event'],
    ...(payload && { action: payload.action }),
  }
}

export const handler = async (event: Event, _context: Context) => {
  console.log()
  console.log('-'.repeat(80))
  console.log()

  const query = getLoggerQuery(event)

  logger.info({ query }, 'invoked github function')

  try {
    verifyEvent('sha256Verifier', {
      event,
      secret: process.env.GITHUB_APP_WEBHOOK_SECRET,
      options: {
        signatureHeader: 'X-Hub-Signature-256',
      },
    })

    logger.info({ query }, 'webhook verified')

    const payload: Payload = JSON.parse(event.body)

    await addIdsToProcessEnv({
      owner: payload.organization.login,
      name: payload.repository.name,
    })

    const sifter = sift({
      'issues.opened': handleIssuesOpened,
      'issues.labeled': handleIssuesLabeled,
      'pull_request.opened': handlePullRequestOpened,
      'pull_request.labeled': handlePullRequestLabeled,
    })

    await sifter(event, payload, {
      logger: logger.child({ query: getLoggerQuery(event, payload) }),
    })

    /**
     * What to return?
     *
     * @see {@link https://docs.github.com/en/rest/guides/best-practices-for-integrators#provide-as-much-information-as-possible-to-the-user }
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
      logger.error({ error }, error.message)

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: error.message,
        }),
      }
    }
  }
}

/**
 * When an issue's opened, add it to the triage project and assign a core team triage member.
 *
 * @remarks
 *
 * If an issue's opened by a core team maintainer,
 * they should triage it.
 */
function handleIssuesOpened(
  event: Event,
  payload: IssuesOpenedEvent,
  ctx: Record<string, any>
) {
  if (coreTeamMaintainerLogins.includes(payload.sender.login)) {
    ctx.logger.info("author's a core team maintainer; returning")
    return
  }

  ctx.logger.info("author isn't a core team maintainer ")
  ctx.logger.info('adding to triage project and assigning to core team triage')
  return Promise.allSettled([
    addToTriageProject({ contentId: (payload.issue as Issue).node_id }),
    assignCoreTeamTriage({ assignableId: (payload.issue as Issue).node_id }),
  ])
}

/**
 * We handle two labels:
 *
 * - action/add-to-release
 * - action/add-to-ctm-discussion-queue
 */
function handleIssuesLabeled(
  event: Event,
  payload: IssuesLabeledEvent,
  ctx: Record<string, any>
) {
  switch (payload.label.name) {
    case 'action/add-to-release':
      ctx.logger.info(
        'issue labeled "action/add-to-release". adding to the release project'
      )
      return handleAddToReleaseLabel(payload.issue.node_id)

    case 'action/add-to-ctm-discussion-queue':
      ctx.logger.info(
        `issue labeled "action/add-to-ctm-discussion-queue". adding to the ctm discussion queue`
      )
      return handleAddToCTMDiscussionQueueLabel(payload.issue.node_id)
  }
}

/**
 * - remove the label
 * - if it's on the triage project, delete it from there
 * - finally, add it to the release project
 */
async function handleAddToReleaseLabel(node_id: string) {
  await removeAddToReleaseLabel({ labelableId: node_id })

  const itemId = await getIssueItemIdOnTriageProject({ issueId: node_id })

  if (itemId) {
    await deleteFromTriageProject({
      itemId,
    })
  }

  const { addProjectNextItem } = await addToReleaseProject({
    contentId: node_id,
  })

  await updateReleaseStatusFieldToInProgress({
    itemId: addProjectNextItem.projectNextItem.id,
  })
}

/**
 * - remove the label
 * - add it to the ctm discussion queue
 *   - this involves 1) adding it to the triage project and 2) giving it a priority of "TP1"
 */
async function handleAddToCTMDiscussionQueueLabel(node_id: string) {
  await removeAddToCTMDiscussionQueueLabel({
    labelableId: node_id,
  })
  await addToCTMDiscussionQueue({
    contentId: node_id,
  })
}

/**
 * When a pull request's opened, add it to the release project.
 *
 * @remarks
 *
 * If it was opened by a core team maintainer,
 * make sure they're assigned to it and give it the "In progress" status.
 * Otherwise, give it the "New PRs" status.
 */
async function handlePullRequestOpened(
  event: Event,
  payload: PullRequestOpenedEvent,
  ctx: Record<string, any>
) {
  ctx.logger.info('adding pull request to the release project')
  const { addProjectNextItem } = await addToReleaseProject({
    contentId: (payload.pull_request as PullRequest).node_id,
  })

  await updateReleaseStatusFieldToNewPRs({
    itemId: addProjectNextItem.projectNextItem.id,
  })

  if (!coreTeamMaintainerLogins.includes(payload.sender.login)) {
    return
  }

  ctx.logger.info(
    `author's a core team maintainer; updating the status field to "In progress" `
  )

  await updateReleaseStatusFieldToInProgress({
    itemId: addProjectNextItem.projectNextItem.id,
  })

  /**
   * Make sure the core team maintainer who opened the PR or another core team maintainer is assigned.
   */
  if (
    !(payload.pull_request as PullRequest).assignees.length ||
    !(payload.pull_request as PullRequest).assignees
      .map((assignee) => assignee.login)
      .some((login) => coreTeamMaintainerLogins.includes(login))
  ) {
    ctx.logger.info(
      "the core team maintainer didn't assign themselves; assigning them"
    )
    return addAssigneesToAssignable({
      assignableId: (payload.pull_request as PullRequest).node_id,
      assigneeIds: [coreTeamMaintainers[payload.sender.login].id],
    })
  }
}

function handlePullRequestLabeled(
  event: Event,
  payload: PullRequestLabeledEvent,
  ctx: Record<string, any>
) {
  switch (payload.label.name) {
    case 'action/add-to-ctm-discussion-queue':
      ctx.logger.info(
        `pull request labeled "action/add-to-ctm-discussion-queue". adding to the ctm discussion queue`
      )
      return handleAddToCTMDiscussionQueueLabel(payload.pull_request.node_id)
  }
}

/**
 * Utility for routing eventActions to handlers.
 */
type Events = 'issues' | 'pull_request'
type Actions = 'opened' | 'labeled'
type EventActions = `${Events}.${Actions}`

type EventActionHandlers = Record<
  EventActions,
  (event: Event, payload: Payload, ctx: Record<string, any>) => Promise<unknown>
>

function sift(eventActionHandlers: EventActionHandlers) {
  async function sifter(
    event: Event,
    payload: Payload,
    ctx: Record<string, any>
  ) {
    const eventAction =
      `${event.headers['x-github-event']}.${payload.action}` as EventActions

    const handlers = Object.entries(eventActionHandlers)
      .filter(([key]) => key === eventAction)
      .map(([, fn]) => fn)

    if (!handlers.length) {
      ctx.logger.info(`no event-action handlers found for ${eventAction}`)
      return
    }

    ctx.logger.info(
      `found ${handlers.length} event-action handler to run: ${handlers
        .map((handler) => handler.name)
        .join(', ')}`
    )

    await Promise.allSettled(
      handlers.map((handler) => handler(event, payload, ctx))
    )
  }

  return sifter
}
