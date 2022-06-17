import fs from 'node:fs'
import path from 'node:path'

import { graphql } from 'msw'

import { GetLabelIdsQueryRes } from './labels'

export const labelable = {
  id: 'labelable',
  labels: [],
  clear() {
    this.labels = []
  },
}

const handlers = [
  graphql.query<GetLabelIdsQueryRes, any>(
    'GetLabelIdsQuery',
    (_req, res, ctx) => {
      return res(
        ctx.data(
          JSON.parse(
            fs.readFileSync(
              path.join(__dirname, 'payloads', 'GetLabelIdsQuery.json'),
              'utf-8'
            )
          )
        )
      )
    }
  ),
  graphql.mutation<any, { labelableId: string; labelIds: string[] }>(
    'RemoveLabelsFromLabelableMutation',
    (req, res, _ctx) => {
      const { labelIds } = req.variables

      labelable.labels.push(...labelIds)

      return res()
    }
  ),
]

export default handlers
