import { graphql } from 'msw'

import { content } from 'src/functions/github/github.handlers'

const handlers = [
  graphql.mutation('AddAssigneesToAssignableMutation', (req, res, _ctx) => {
    const { assigneeIds } = req.variables

    content.assignees.push(...assigneeIds)

    return res()
  }),
]

export default handlers
