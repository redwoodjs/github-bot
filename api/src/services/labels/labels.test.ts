import { setupServer } from 'msw/node'

import { setPayload, content } from 'src/functions/github/github.handlers'
import { installationHandler } from 'src/lib/github'

import {
  getLabelIdsQuery,
  getLabelNamesToIds,
  labels,
  labelNamesToIds,
  removeLabel,
  removeLabelsFromLabelableMutation,
} from './labels'
import handlers from './labels.handlers'

const server = setupServer(installationHandler, ...handlers)

beforeAll(() => server.listen())
afterEach(() => {
  labelNamesToIds.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

it('uses the correct labels', () => {
  expect(labels).toMatchInlineSnapshot(`
    Array [
      "action/add-to-cycle",
      "action/add-to-discussion-queue",
      "action/add-to-backlog",
    ]
  `)
})

describe('getLabelNamesToIds', () => {
  it('uses the correct operation', () => {
    expect(getLabelIdsQuery).toMatchInlineSnapshot(`
      "
        query GetLabelIdsQuery($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            labels(first: 100) {
              nodes {
                name
                id
              }
            }
          }
        }
      "
    `)
  })

  it('gets and caches ids from titles', async () => {
    expect(labelNamesToIds.size).toBe(0)

    await getLabelNamesToIds()

    expect(labelNamesToIds).toMatchInlineSnapshot(`
      Map {
        "action/add-to-cycle" => "LA_kwDOC2M2f87e3FkP",
        "action/add-to-discussion-queue" => "LA_kwDOC2M2f871Z5FF",
        "action/add-to-backlog" => "LA_kwDOC2M2f87fhNsx",
      }
    `)
  })
})

describe('removeLabel', () => {
  it('uses the correct operation', () => {
    expect(removeLabelsFromLabelableMutation).toMatchInlineSnapshot(`
      "
        mutation RemoveLabelsFromLabelableMutation($labelableId: ID!, $labelIds: [ID!]!) {
          removeLabelsFromLabelable(
            input: { labelableId: $labelableId, labelIds: $labelIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('removes a label', async () => {
    setPayload('issues.labeled')

    await getLabelNamesToIds()

    expect(content.labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_id: labelNamesToIds.get('action/add-to-discussion-queue'),
        }),
      ])
    )

    await removeLabel(content.id, { label: 'action/add-to-discussion-queue' })

    expect(content.labels).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_id: labelNamesToIds.get('action/add-to-discussion-queue'),
        }),
      ])
    )
  })
})
