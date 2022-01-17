import { octokit } from 'src/lib/github'

export async function getRepositoryId({
  owner,
  name,
}: {
  owner: string
  name: string
}) {
  const {
    repository: { id },
  } = await octokit.graphql<{ repository: { id: string } }>(QUERY, {
    owner,
    name,
  })

  return id
}

export const QUERY = `
  query GetRepositoryId($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
    }
  }
`

export function getRedwoodJSRepositoryId(name: string) {
  return getRepositoryId({ owner: 'redwoodjs', name })
}
