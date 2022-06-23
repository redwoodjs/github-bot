import fs from 'node:fs'
import path from 'node:path'

import { graphql } from 'msw'

import { content } from 'src/functions/github/github.handlers'

const handlers = [
  graphql.query('GetLabelIdsQuery', (_req, res, ctx) => {
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
  }),
  graphql.mutation<any, { labelableId: string; labelIds: string[] }>(
    'RemoveLabelsFromLabelableMutation',
    (req, res, _ctx) => {
      const {
        labelIds: [labelId],
      } = req.variables

      content.labels = content.labels.filter(
        (label) => label.node_id !== labelId
      )

      return res()
    }
  ),
]

export default handlers
