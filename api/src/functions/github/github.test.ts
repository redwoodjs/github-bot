import fs from 'node:fs'
import path from 'node:path'

import { setupServer } from 'msw/node'

import { mockSignedWebhook } from '@redwoodjs/testing/api'

import { installationHandler } from 'src/lib/github'
import assignHandlers from 'src/services/assign/assign.handlers'
import labelsHandlers from 'src/services/labels/labels.handlers'
import milestonesHandlers from 'src/services/milestones/milestones.handlers'
import projectsHandlers, {
  project,
} from 'src/services/projects/projects.handlers'

import { handler } from './github'

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

describe('github function', () => {
  it.skip('handles issues opened by a contributor', async () => {
    const payload = fs.readFileSync(
      path.join(__dirname, 'payloads', 'issues.opened.json'),
      'utf-8'
    )

    const event = mockSignedWebhook({
      payload,
      signatureType: 'sha256Verifier',
      signatureHeader: 'X-Hub-Signature-256',
      secret: 'secret',
      headers: {
        'x-github-event': 'issues',
      },
    })

    await handler(event, null)

    expect(item).toMatchInlineSnapshot(`
      Object {
        "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
          "value": "30985805",
        },
        "id": "item",
      }
    `)

    expect(project.items).toEqual(
      expect.arrayContaining([expect.objectContaining(item)])
    )
  })
})
