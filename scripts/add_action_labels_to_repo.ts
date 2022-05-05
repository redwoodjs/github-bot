import { getRepositoryId } from 'api/src/services/github'
import { createActionLabelsInRepository } from 'api/src/services/labels'

export default async ({ args }) => {
  const id = await getRepositoryId({
    owner: 'orgtoar',
    name: 'github-bot-test',
  })
  console.log({ id })
  const labels = await createActionLabelsInRepository(id)
  console.log({ labels: JSON.stringify(labels, null, 2) })
}
