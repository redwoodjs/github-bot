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
  getContentItemIdOnTriageProject,
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
import {
  addChoreMilestoneToPullRequest,
  addNextReleaseMilestoneToPullRequest,
} from 'src/services/milestones/milestones'
import type { AddMilestoneToPullRequestRes } from 'src/services/milestones/milestones'

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

    await addIdsToProcessEnv({
      owner: payload.organization.login,
      name: payload.repository.name,
    })

    const sifter = sift({
      'issues.opened': handleIssuesOpened,
      'issues.labeled': handleContentLabeled,
      'pull_request.opened': handlePullRequestOpened,
      'pull_request.labeled': handleContentLabeled,
      'pull_request.closed': handlePullRequestClosed,
    })

    await sifter(event, payload)

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
  } finally {
    console.log()
    console.log('-'.repeat(80))
    console.log()
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
function handleIssuesOpened(event: Event, payload: IssuesOpenedEvent) {
  if (coreTeamMaintainerLogins.includes(payload.sender.login)) {
    logger.info("author's a core team maintainer; returning")
    return
  }

  logger.info("author isn't a core team maintainer ")
  logger.info('adding to triage project and assigning to core team triage')
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
function handleContentLabeled(
  event: Event,
  payload: IssuesLabeledEvent | PullRequestLabeledEvent
) {
  const node_id = payload.issue?.node_id ?? payload.pull_request.node_id

  switch (payload.label.name) {
    case 'action/add-to-release':
      logger.info(
        'content labeled "action/add-to-release". adding to the release project'
      )
      return handleAddToReleaseLabel(node_id)

    case 'action/add-to-ctm-discussion-queue':
      logger.info(
        'content labeled "action/add-to-ctm-discussion-queue". adding to the ctm discussion queue'
      )
      return handleAddToCTMDiscussionQueueLabel(node_id)
  }
}

/**
 * - remove the label
 * - if it's on the triage project, delete it from there
 * - finally, add it to the release project
 */
async function handleAddToReleaseLabel(node_id: string) {
  await removeAddToReleaseLabel({ labelableId: node_id })

  const itemId = await getContentItemIdOnTriageProject({ contentId: node_id })

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
  payload: PullRequestOpenedEvent
) {
  if (payload.sender.login === 'renovate[bot]') {
    logger.info('pull request opened by renovate bot; returning')
    return
  }

  logger.info('adding pull request to the release project')
  const { addProjectNextItem } = await addToReleaseProject({
    contentId: (payload.pull_request as PullRequest).node_id,
  })

  await updateReleaseStatusFieldToNewPRs({
    itemId: addProjectNextItem.projectNextItem.id,
  })

  if (!coreTeamMaintainerLogins.includes(payload.sender.login)) {
    return
  }

  logger.info(
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
    logger.info(
      "the core team maintainer didn't assign themselves; assigning them"
    )
    return addAssigneesToAssignable({
      assignableId: (payload.pull_request as PullRequest).node_id,
      assigneeIds: [coreTeamMaintainers[payload.sender.login].id],
    })
  }
}

/**
 * - make sure it was merged, not closed
 * - if it was merged to main and doesn't have the next-release-patch milestone, add the next-release milestone
 * - if it was merged to a branch other than main, add the chore milestone
 */
function handlePullRequestClosed(
  event: Event,
  payload: PullRequestEvent
): void | Promise<AddMilestoneToPullRequestRes> {
  if (!payload.pull_request.merged) {
    logger.info('the pull_request was closed; returning')
    return
  }

  if (payload.pull_request.base.ref === 'main') {
    logger.info('the pull request was merged to main')

    if (payload.pull_request.milestone?.title === 'next-release-patch') {
      logger.info(
        'the pull_request already has the next-release-patch milestone; returning'
      )
      return
    }

    logger.info('adding the next-release milestone')
    return addNextReleaseMilestoneToPullRequest(payload.pull_request.node_id)
  } else {
    logger.info(
      `the pull request was merged into ${payload.pull_request.base.ref}`
    )
    logger.info('adding the chore milestone')
    return addChoreMilestoneToPullRequest(payload.pull_request.node_id)
  }
}

/**
 * Utility for routing eventActions to handlers.
 */
type Events = 'issues' | 'pull_request'
type Actions = 'opened' | 'labeled' | 'closed'
type EventActions = `${Events}.${Actions}`

type EventActionHandlers = Record<
  EventActions,
  (event: Event, payload: Payload) => Promise<unknown>
>

function sift(eventActionHandlers: EventActionHandlers) {
  async function sifter(event: Event, payload: Payload) {
    const eventAction =
      `${event.headers['x-github-event']}.${payload.action}` as EventActions

    const handlers = Object.entries(eventActionHandlers)
      .filter(([key]) => key === eventAction)
      .map(([, fn]) => fn)

    if (!handlers.length) {
      logger.info(`no event-action handlers found for ${eventAction}`)
      return
    }

    logger.info(
      `found ${handlers.length} event-action handler to run: ${handlers
        .map((handler) => handler.name)
        .join(', ')}`
    )

    await Promise.allSettled(handlers.map((handler) => handler(event, payload)))
  }

  return sifter
}
