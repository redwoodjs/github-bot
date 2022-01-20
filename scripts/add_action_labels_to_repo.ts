import { getRedwoodJSRepositoryId } from 'api/src/services/github'
import { createActionLabelsInRepository } from 'api/src/services/labels'

export default async ({ args }) => {
  const id = await getRedwoodJSRepositoryId(args.repo)
  console.log({ id })
  const labels = await createActionLabelsInRepository(id)
  console.log({ labels: JSON.stringify(labels, null, 2) })
}
