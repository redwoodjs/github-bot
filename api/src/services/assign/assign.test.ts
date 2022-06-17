import { addAssigneesToAssignableMutation } from './assign'

describe('addAssigneesToAssignable ', () => {
  it('uses the correct query', () => {
    expect(addAssigneesToAssignableMutation).toMatchInlineSnapshot(`
      "
        mutation AddAssigneesToAssignableMutation($assignableId: ID!, $assigneeIds: [ID!]!) {
          addAssigneesToAssignable(
            input: { assignableId: $assignableId, assigneeIds: $assigneeIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })
})
