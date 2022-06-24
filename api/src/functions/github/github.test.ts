import { setupServer } from 'msw/node'

import { mockSignedWebhook } from '@redwoodjs/testing/api'

import { installationHandler } from 'src/lib/github'
import assignHandlers from 'src/services/assign/assign.handlers'
import { labelNamesToIds } from 'src/services/labels'
import labelsHandlers from 'src/services/labels/labels.handlers'
import { milestoneTitlesToIds } from 'src/services/milestones'
import milestonesHandlers from 'src/services/milestones/milestones.handlers'
import {
  checkNeedsDiscussionId,
  currentCycleId,
  fieldNamesToIds,
  statusNamesToIds,
} from 'src/services/projects'
import projectsHandlers, {
  project,
} from 'src/services/projects/projects.handlers'

import { handler } from './github'
import { payload, setPayload, content } from './github.handlers'

const server = setupServer(
  installationHandler,
  ...assignHandlers,
  ...labelsHandlers,
  ...milestonesHandlers,
  ...projectsHandlers
)

beforeAll(() => server.listen())
afterEach(() => {
  project.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

const getMockEvent = () =>
  mockSignedWebhook({
    payload,
    signatureType: 'sha256Verifier',
    signatureHeader: 'X-Hub-Signature-256',
    secret: 'secret',
    headers: {
      'x-github-event': payload.issue ? 'issues' : 'pull_request',
    },
  })

process.env.GITHUB_APP_WEBHOOK_SECRET = 'secret'

describe('github function', () => {
  describe('issues', () => {
    it('handles issues opened by contributors', async () => {
      setPayload('issues.opened.contributor')

      await handler(getMockEvent(), null)

      expect(project.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: fieldNamesToIds.get('Status'),
                  value: statusNamesToIds.get('Triage'),
                }),
              ]),
            },
          }),
        ])
      )

      expect(content.assignees.length).toBe(1)
    })

    it('handles issues opened by the core team', async () => {
      setPayload('issues.opened.coreTeam')
      await handler(getMockEvent(), null)
      expect(project.items.length).toBe(0)
    })

    it('handles issues labeled', async () => {
      setPayload('issues.labeled')

      await handler(getMockEvent(), null)

      expect(content.labels).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            node_id: labelNamesToIds.get('action/add-to-discussion-queue'),
          }),
        ])
      )

      expect(project.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: fieldNamesToIds.get('Needs discussion'),
                  value: checkNeedsDiscussionId,
                }),
              ]),
            },
          }),
        ])
      )
    })

    it.skip('handles issues closed', async () => {
      setPayload('issues.closed')

      await handler(getMockEvent(), null)

      expect(project.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            [fieldNamesToIds.get('Status')]: statusNamesToIds.get('Done'),
          }),
        ])
      )
    })
  })

  describe('pull requests', () => {
    it.skip('opened by contributors', async () => {
      setPayload('pull_request.opened.contributor')

      await handler(getMockEvent(), null)

      expect(project.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            [fieldNamesToIds.get('Status')]: statusNamesToIds.get('Triage'),
          }),
        ])
      )
    })

    it.skip('opened by the core team', async () => {
      setPayload('pull_request.opened.coreTeam')

      await handler(getMockEvent(), null)

      expect(project.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            [fieldNamesToIds.get('Cycle')]: currentCycleId,
            [fieldNamesToIds.get('Status')]:
              statusNamesToIds.get('In progress'),
          }),
        ])
      )

      // payload.sender.login...
      expect(content.assignees.length).toBe(1)
    })

    it('opened by renovate', async () => {
      setPayload('pull_request.opened.renovate')
      await handler(getMockEvent(), null)
      expect(project.items.length).toBe(0)
    })

    it('merged into main', async () => {
      setPayload('pull_request.closed')

      await handler(getMockEvent(), null)

      expect(content).toHaveProperty(
        'milestone',
        milestoneTitlesToIds.get('next-release')
      )
    })

    it.skip('merged into main with the next-release patch milestone', async () => {
      setPayload('pull_request.closed.patch')

      await handler(getMockEvent(), null)

      expect(content).toHaveProperty(
        'milestone',
        milestoneTitlesToIds.get('next-release-patch')
      )
    })

    it.skip('merged into a branch other than main', async () => {
      setPayload('pull_request.closed')

      await handler(getMockEvent(), null)

      expect(content).toHaveProperty(
        'milestone',
        milestoneTitlesToIds.get('chore')
      )
    })
  })
})
