export const schema = gql`
  type Mutation {
    markStale: Boolean! @skipAuth
  }
`
