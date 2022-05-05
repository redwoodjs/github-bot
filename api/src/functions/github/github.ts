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

import {
  startSmeeClient,
  coreTeamMaintainerLogins,
  coreTeamMaintainers,
} from 'src/lib/github'
import { logger } from 'src/lib/logger'
import { addAssigneesToAssignable } from 'src/services/assign'
import { addIdsToProcessEnv } from 'src/services/github'
import { removeLabels } from 'src/services/labels'
import {
  addChoreMilestoneToPullRequest,
  addNextReleaseMilestoneToPullRequest,
} from 'src/services/milestones'
import type { AddMilestoneToPullRequestRes } from 'src/services/milestones'
import {
  addToMainProject,
  updateMainProjectItemStatusFieldToInProgress,
  getContentItemIdOnMainProject,
  updateMainProjectItemStatusFieldToDone,
  updateMainProjectItemCycleFieldToCurrent,
  updateMainProjectItemStatusFieldToTriage,
  updateMainProjectItemStatusFieldToBacklog,
} from 'src/services/projects'

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
      'issues.closed': handleIssuesClosed,
      'pull_request.opened': handlePullRequestOpened,
      'pull_request.labeled': handleContentLabeled,
      'pull_request.closed': handlePullRequestClosed,
    })

    await sifter(event, payload)

    /**
     * What to return?
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
async function handleIssuesOpened(event: Event, payload: IssuesOpenedEvent) {
  if (coreTeamMaintainerLogins.includes(payload.sender.login)) {
    logger.info("Author's a core team maintainer; returning")
    return
  }

  logger.info("Author isn't a core team maintainer ")
  logger.info('Adding to project and assigning')

  const { addProjectNextItem } = await addToMainProject(
    (payload.issue as Issue).node_id
  )

  await updateMainProjectItemStatusFieldToTriage(
    addProjectNextItem.projectNextItem.id
  )

  // TODO
  // await assignCoreTeamTriage({ assignableId: (payload.issue as Issue).node_id })
}

function handleContentLabeled(
  event: Event,
  payload: IssuesLabeledEvent | PullRequestLabeledEvent
) {
  const node_id = payload.issue?.node_id ?? payload.pull_request.node_id

  switch (payload.label.name) {
    case 'action/add-to-cycle':
      logger.info(
        `content labeled ${payload.label.name}; adding to the current cycle`
      )
      return handleAddToCycleLabel(node_id)

    case 'action/add-to-backlog':
      logger.info(
        `content labeled ${payload.label.name}; adding to the backlog`
      )
      return handleAddToBacklog(node_id)
  }
}

async function handleAddToCycleLabel(node_id: string) {
  await removeLabels({
    labelableId: node_id,
    labelIds: [process.env.ADD_TO_CYCLE_LABEL_ID],
  })

  const { addProjectNextItem } = await addToMainProject(node_id)

  await updateMainProjectItemStatusFieldToInProgress(
    addProjectNextItem.projectNextItem.id
  )

  return updateMainProjectItemCycleFieldToCurrent(
    addProjectNextItem.projectNextItem.id
  )
}

async function handleAddToBacklog(node_id: string) {
  await removeLabels({
    labelableId: node_id,
    labelIds: [process.env.ADD_TO_BACKLOG_LABEL_ID],
  })

  const { addProjectNextItem } = await addToMainProject(node_id)

  return updateMainProjectItemStatusFieldToBacklog(
    addProjectNextItem.projectNextItem.id
  )

  // TODO
  // assign priority (1?)
}

async function handleIssuesClosed(event: Event, payload: IssuesEvent) {
  const projectItemId = await getContentItemIdOnMainProject(
    payload.issue.node_id
  )

  if (!projectItemId) {
    logger.info("Issue isn't on the board; returning")
    return
  }

  logger.info('Issue is on the board; moving to done')
  return updateMainProjectItemStatusFieldToDone(projectItemId)
}

async function handlePullRequestOpened(
  event: Event,
  payload: PullRequestOpenedEvent
) {
  if (payload.sender.login === 'renovate[bot]') {
    logger.info('Pull request opened by renovate bot; returning')
    return
  }

  logger.info('Adding pull request to the project')

  const { addProjectNextItem } = await addToMainProject(
    (payload.pull_request as PullRequest).node_id
  )

  await updateMainProjectItemStatusFieldToTriage(
    addProjectNextItem.projectNextItem.id
  )

  if (!coreTeamMaintainerLogins.includes(payload.sender.login)) {
    return
  }

  logger.info(
    'Author is a core team maintainer; updating the status field to in progress and adding to the current cycle'
  )

  await updateMainProjectItemStatusFieldToInProgress(
    addProjectNextItem.projectNextItem.id
  )

  await updateMainProjectItemCycleFieldToCurrent(
    addProjectNextItem.projectNextItem.id
  )

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
      "The core team maintainer didn't assign themselves; assigning them"
    )

    return addAssigneesToAssignable({
      assignableId: (payload.pull_request as PullRequest).node_id,
      assigneeIds: [coreTeamMaintainers[payload.sender.login].id],
    })
  }
}

function handlePullRequestClosed(
  event: Event,
  payload: PullRequestEvent
): void | Promise<AddMilestoneToPullRequestRes> {
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
    return addNextReleaseMilestoneToPullRequest(payload.pull_request.node_id)
  } else {
    logger.info(
      `The pull request was merged into ${payload.pull_request.base.ref}`
    )
    logger.info('Adding the chore milestone')
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
