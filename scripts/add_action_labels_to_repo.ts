import { getRedwoodJSRepositoryId } from 'api/src/services/github'
import { createActionLabelsInRedwoodJSRepository } from 'api/src/services/labels'

export default async ({ args }) => {
  const id = await getRedwoodJSRepositoryId(args.repo)
  console.log({ id })
  const labels = await createActionLabelsInRedwoodJSRepository(id)
  console.log({ labels: JSON.stringify(labels, null, 2) })
}
