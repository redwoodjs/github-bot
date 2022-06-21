import fs from 'node:fs'
import path from 'node:path'

import { graphql } from 'msw'

export function getPayload(operationName: string) {
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'payloads', `${operationName}.json`),
      'utf-8'
    )
  )
}

import type {
  GetProjectIdQueryRes,
  AddProjectNextItemMutationRes,
  GetProjectNextFieldsQueryRes,
} from './projects'

export const project = {
  title: 'Main',
  id: 'PN_kwDOAq9qTM4ABn0O',
  items: [],
  clear() {
    this.items = []
  },
}

const handlers = [
  graphql.query<GetProjectIdQueryRes, any>(
    'GetProjectIdQuery',
    (_req, res, ctx) => {
      return res(ctx.data(getPayload('GetProjectIdQuery')))
    }
  ),
  graphql.mutation<AddProjectNextItemMutationRes, any>(
    'AddProjectNextItemMutation',
    (_req, res, ctx) => {
      const item = { id: 'item' }

      project.items.push(item)

      return res(
        ctx.data({
          addProjectNextItem: {
            projectNextItem: {
              id: item.id,
            },
          },
        })
      )
    }
  ),
  graphql.mutation<any, { projectId: string; itemId: string }>(
    'DeleteProjectNextItemMutation',
    (req, res, _ctx) => {
      const { itemId } = req.variables

      project.items = project.items.filter((item) => item.id !== itemId)

      return res()
    }
  ),
  graphql.query<GetProjectNextFieldsQueryRes, any>(
    'GetProjectNextFieldsQuery',
    (_req, res, ctx) => {
      return res(ctx.data(getPayload('GetProjectNextFieldsQuery')))
    }
  ),
  graphql.mutation<
    any,
    {
      projectId: string
      itemId: string
      fieldId: string
      value: string
    }
  >('UpdateProjectNextItemFieldMutation', (req, res, _ctx) => {
    const { itemId, fieldId, value } = req.variables

    const item = project.items.find((item) => item.id === itemId)

    item[fieldId] = value

    return res()
  }),
  graphql.query('GetProjectItemsQuery', (_req, res, ctx) => {
    return res(ctx.data(getPayload('GetProjectItemsQuery')))
  }),
]

export default handlers
