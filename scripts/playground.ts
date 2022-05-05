import { getIds } from 'api/src/services/github'

export default async () => {
  const ids = await getIds({ owner: 'orgtoar', name: 'github-bot-test' })

  console.log({
    ids,
  })
}
