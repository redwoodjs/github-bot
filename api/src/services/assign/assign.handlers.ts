import { graphql } from 'msw'

const handlers = [
  graphql.mutation('AddAssigneesToAssignableMutation', (req, res, _ctx) => {
    const { assigneeIds } = req.variables

    return res()
  }),
]

export default handlers
